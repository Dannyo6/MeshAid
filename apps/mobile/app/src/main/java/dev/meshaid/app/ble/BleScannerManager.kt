package dev.meshaid.app.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanRecord
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import dev.meshaid.app.protocol.MeshAidPacket
import dev.meshaid.app.protocol.MeshAidPacketCodec
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Hardware Scanner Manager
 * Discovers neighboring nodes using a targeted ScanFilter for the MeshAid 128-bit
 * custom Service UUID and reassembles multi-chunk legacy packets.
 */
class BleScannerManager(private val context: Context? = null) {

    companion object {
        private const val TAG = "BleScannerManager"
        const val REASSEMBLY_TTL_MS = 30_000L // Chunks expire after 30s TTL if incomplete
        const val MAX_ASSEMBLY_SESSIONS = 100  // Bounded LRU cache size limit
    }

    private val bluetoothManager: BluetoothManager? =
        context?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter?
        get() = bluetoothManager?.adapter
    private val scanner: BluetoothLeScanner?
        get() = bluetoothAdapter?.bluetoothLeScanner

    @Volatile
    var isScanning: Boolean = false
        private set

    private val _packetFlow = MutableSharedFlow<MeshAidPacket>(extraBufferCapacity = 64)
    val packetFlow: SharedFlow<MeshAidPacket> = _packetFlow.asSharedFlow()

    var onPacketReceived: ((MeshAidPacket) -> Unit)? = null
    var onScanError: ((errorCode: Int, message: String) -> Unit)? = null

    // Bounded LRU Cache capped at 100 entries (access-ordered)
    internal val assemblyMap: HashMap<String, ChunkAssemblySession> =
        object : LinkedHashMap<String, ChunkAssemblySession>(16, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ChunkAssemblySession>?): Boolean {
                return size > MAX_ASSEMBLY_SESSIONS
            }
        }

    // Deduplication filter: recently seen packet message IDs with timestamps
    private val seenMessageIds = ConcurrentHashMap<String, Long>()

    /**
     * Represents an active chunk reassembly session with strict bounds enforcement
     * and a 30s expiration lifecycle.
     */
    internal class ChunkAssemblySession(
        val totalChunks: Int,
        var createdAt: Long = System.currentTimeMillis()
    ) {
        init {
            require(totalChunks in 1..16) {
                "totalChunks must be in 1..16, got $totalChunks"
            }
        }

        private val chunkArray: Array<ByteArray?> = arrayOfNulls(totalChunks)
        private var receivedChunksCount = 0

        /**
         * Adds a chunk payload at the specified index.
         * Enforces require(chunkIndex in 0 until totalChunks) and prevents duplicate chunk overwrites.
         * Returns true if chunk was accepted, false if it was already ingested.
         */
        @Synchronized
        fun addChunk(chunkIndex: Int, chunkData: ByteArray): Boolean {
            require(chunkIndex in 0 until totalChunks) {
                "chunkIndex $chunkIndex is out of bounds (totalChunks=$totalChunks)"
            }
            if (chunkArray[chunkIndex] != null) {
                // Prevent duplicate chunk payload overwrites if the chunk was already ingested
                return false
            }
            chunkArray[chunkIndex] = chunkData
            receivedChunksCount++
            return true
        }

        fun getChunk(chunkIndex: Int): ByteArray? {
            if (chunkIndex !in 0 until totalChunks) return null
            return chunkArray[chunkIndex]
        }

        val chunks: Map<Int, ByteArray>
            @Synchronized
            get() = chunkArray.mapIndexedNotNull { index, bytes ->
                if (bytes != null) index to bytes else null
            }.toMap()

        @Synchronized
        fun isComplete(): Boolean = receivedChunksCount == totalChunks

        @Synchronized
        fun assemble(): ByteArray {
            val bos = ByteArrayOutputStream()
            for (i in 0 until totalChunks) {
                val data = chunkArray[i] ?: return ByteArray(0)
                bos.write(data)
            }
            return bos.toByteArray()
        }
    }

    /**
     * Starts continuous BLE scanning filtered by the MeshAid custom Service UUID
     */
    @Synchronized
    fun startScan() {
        if (isScanning) return

        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner not available")
            onScanError?.invoke(-1, "BluetoothLeScanner is not available")
            return
        }

        try {
            // Targeted scan filters for MeshAid 128-bit Service UUID
            val serviceFilter = ScanFilter.Builder()
                .setServiceUuid(BleConstants.PARCEL_SERVICE_UUID)
                .build()

            // Filter for legacy manufacturer-data chunked broadcasts
            val manufacturerFilter = ScanFilter.Builder()
                .setManufacturerData(BleConstants.MANUFACTURER_ID, byteArrayOf())
                .build()

            val filters = listOf(serviceFilter, manufacturerFilter)

            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setReportDelay(0)
                .apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        setLegacy(false)
                    }
                }
                .build()

            scanner?.startScan(filters, settings, scanCallback)
            isScanning = true
            Log.i(TAG, "BLE Scanner started with targeted MeshAid filters")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException starting BLE scan: ${e.message}")
            onScanError?.invoke(-2, "Missing BLUETOOTH_SCAN permission")
        } catch (e: Exception) {
            Log.e(TAG, "Exception starting BLE scan: ${e.message}")
            onScanError?.invoke(-3, e.message ?: "Failed to start BLE scanner")
        }
    }

    /**
     * Stops active BLE scanning
     */
    @Synchronized
    fun stopScan() {
        if (!isScanning) return

        try {
            scanner?.stopScan(scanCallback)
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping scan: ${e.message}")
        } finally {
            isScanning = false
            synchronized(assemblyMap) {
                assemblyMap.clear()
            }
            Log.i(TAG, "BLE Scanner stopped")
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.let { processScanResult(it) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>?) {
            results?.forEach { processScanResult(it) }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.w(TAG, "BLE Scan failed with errorCode: $errorCode")
            onScanError?.invoke(errorCode, "Scan failed with error $errorCode")
        }
    }

    /**
     * Processes individual scan results, inspecting both service data and manufacturer chunks
     */
    private fun processScanResult(result: ScanResult) {
        val record = result.scanRecord ?: return
        val deviceAddress = result.device?.address ?: "UNKNOWN"

        // 1. Check for full packet in Extended Advertising Service Data
        val serviceData = record.getServiceData(BleConstants.PARCEL_SERVICE_UUID)
        if (serviceData != null && serviceData.size >= MeshAidPacketCodec.HEADER_SIZE) {
            decodeAndDispatch(serviceData)
            return
        }

        // 2. Check for legacy manufacturer data chunks
        val manufacturerData = record.getManufacturerSpecificData(BleConstants.MANUFACTURER_ID)
        if (manufacturerData != null && manufacturerData.size > BleConstants.LEGACY_CHUNK_HEADER_SIZE) {
            processLegacyChunk(deviceAddress, manufacturerData)
        }
    }

    /**
     * Processes a single legacy broadcast chunk.
     * Enforces TTL expiration pruning before access, validates bounds (totalChunks in 1..16),
     * and manages LRU cache entries.
     */
    @Synchronized
    internal fun processLegacyChunk(deviceAddress: String, chunkBytes: ByteArray): Boolean {
        if (chunkBytes.size <= BleConstants.LEGACY_CHUNK_HEADER_SIZE) {
            return false
        }

        return try {
            val buffer = ByteBuffer.wrap(chunkBytes)
            val totalChunks = buffer.get().toInt() and 0xFF
            val chunkIndex = buffer.get().toInt() and 0xFF
            val corr0 = buffer.get()
            val corr1 = buffer.get()
            val sessionKey = "$deviceAddress-$corr0-$corr1"

            // Enforce totalChunks in 1..16: drop fragmented announcements advertising > 16 chunks
            if (totalChunks !in 1..16) {
                Log.w(TAG, "Dropping malformed chunk: totalChunks $totalChunks not in 1..16")
                return false
            }

            // Enforce chunkIndex in 0 until totalChunks: prevent out-of-bounds array writes
            if (chunkIndex !in 0 until totalChunks) {
                Log.w(TAG, "Dropping malformed chunk: chunkIndex $chunkIndex out of bounds for totalChunks $totalChunks")
                return false
            }

            val chunkData = ByteArray(buffer.remaining())
            buffer.get(chunkData)

            val now = System.currentTimeMillis()
            // Prune all sessions older than 30s TTL before adding or looking up a chunk
            cleanExpiredSessions(now)

            var session = assemblyMap[sessionKey]
            if (session == null) {
                session = ChunkAssemblySession(totalChunks = totalChunks, createdAt = now)
                assemblyMap[sessionKey] = session
            } else if (session.totalChunks != totalChunks) {
                // Total chunks mismatch for the same correlation ID; start fresh session
                session = ChunkAssemblySession(totalChunks = totalChunks, createdAt = now)
                assemblyMap[sessionKey] = session
            }

            // Add chunk payload (prevents duplicate overwrites)
            session.addChunk(chunkIndex, chunkData)

            if (session.isComplete()) {
                val assembledPacketBytes = session.assemble()
                assemblyMap.remove(sessionKey)

                if (assembledPacketBytes.size >= MeshAidPacketCodec.HEADER_SIZE) {
                    decodeAndDispatch(assembledPacketBytes)
                }
                true
            } else {
                false
            }
        } catch (e: Exception) {
            Log.w(TAG, "Discarded malformed chunk: ${e.message}")
            false
        }
    }

    private fun decodeAndDispatch(packetBytes: ByteArray) {
        try {
            val packet = MeshAidPacketCodec.decodePacket(packetBytes)

            // Deduplicate: ignore if seen in the last 10 seconds
            val now = System.currentTimeMillis()
            val msgId = packet.messageIdHex
            val lastSeen = seenMessageIds[msgId]
            if (lastSeen != null && (now - lastSeen) < 10_000L) {
                return
            }
            seenMessageIds[msgId] = now

            // Clean old deduplication entries
            if (seenMessageIds.size > 200) {
                seenMessageIds.entries.removeIf { (now - it.value) > 60_000L }
            }

            Log.i(TAG, "Discovered valid MeshAid emergency packet: ID=${packet.messageIdHex}, Priority=${packet.priority}")
            onPacketReceived?.invoke(packet)
            _packetFlow.tryEmit(packet)
        } catch (e: Exception) {
            Log.d(TAG, "Discarded packet during decode: ${e.message}")
        }
    }

    /**
     * Prunes all sessions where System.currentTimeMillis() - session.createdAt > 30_000L (30s TTL)
     */
    @Synchronized
    internal fun cleanExpiredSessions(now: Long = System.currentTimeMillis()) {
        assemblyMap.entries.removeIf { (now - it.value.createdAt) > REASSEMBLY_TTL_MS }
    }
}
