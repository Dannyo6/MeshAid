package dev.meshaid.app.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import dev.meshaid.app.protocol.MeshAidPacket
import dev.meshaid.app.protocol.MeshAidPacketCodec
import java.nio.ByteBuffer

/**
 * BLE Hardware Advertiser Manager
 * Broadcasts emergency packets via Extended Advertising (BLE 5.0+) with
 * legacy manufacturer-data chunking fallback for older hardware.
 */
class BleAdvertiserManager(private val context: Context) {

    companion object {
        private const val TAG = "BleAdvertiserManager"
        private const val CHUNK_CYCLE_INTERVAL_MS = 600L
    }

    private val bluetoothManager: BluetoothManager? =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter?
        get() = bluetoothManager?.adapter

    private val advertiser: BluetoothLeAdvertiser?
        get() = bluetoothAdapter?.bluetoothLeAdvertiser

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    var isAdvertising: Boolean = false
        private set

    // Extended advertising set reference
    private var currentAdvertisingSet: AdvertisingSet? = null

    // Legacy chunk rotation state
    private var activeChunks: List<ByteArray> = emptyList()
    private var currentChunkIndex: Int = 0
    private var legacyCycleRunnable: Runnable? = null

    var onAdvertisingStarted: (() -> Unit)? = null
    var onAdvertisingStopped: (() -> Unit)? = null
    var onAdvertisingError: ((errorCode: Int, message: String) -> Unit)? = null

    /**
     * Checks if Extended Advertising is supported by the radio chipset
     */
    fun isExtendedAdvertisingSupported(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bluetoothAdapter?.isLeExtendedAdvertisingSupported == true
        } else {
            false
        }
    }

    /**
     * Broadcasts a MeshAidPacket, preferring Extended Advertising with
     * automatic legacy manufacturer-data chunking fallback.
     */
    fun broadcastPacket(packet: MeshAidPacket) {
        val encodedBytes = MeshAidPacketCodec.encodePacket(packet)
        broadcastBytes(encodedBytes, packet.messageId)
    }

    /**
     * Broadcasts raw packet bytes
     */
    @Synchronized
    fun broadcastBytes(packetBytes: ByteArray, messageId: ByteArray? = null) {
        stopAdvertising()

        if (advertiser == null) {
            Log.e(TAG, "BluetoothLeAdvertiser not available on this device")
            onAdvertisingError?.invoke(-1, "BluetoothLeAdvertiser is not available")
            return
        }

        if (isExtendedAdvertisingSupported() && packetBytes.size <= BleConstants.EXTENDED_ADVERTISING_MAX_SIZE) {
            Log.d(TAG, "Broadcasting ${packetBytes.size} bytes via Extended Advertising")
            startExtendedAdvertising(packetBytes)
        } else {
            Log.d(TAG, "Broadcasting ${packetBytes.size} bytes via Legacy Advertising chunking fallback")
            startLegacyChunkedAdvertising(packetBytes, messageId)
        }
    }

    /**
     * Starts BLE 5.0+ Extended Advertising
     */
    private fun startExtendedAdvertising(packetBytes: ByteArray) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        try {
            val parameters = AdvertisingSetParameters.Builder()
                .setLegacyMode(false)
                .setConnectable(true)
                .setInterval(AdvertisingSetParameters.INTERVAL_LOW)
                .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_HIGH)
                .setPrimaryPhy(android.bluetooth.BluetoothDevice.PHY_LE_1M)
                .setSecondaryPhy(android.bluetooth.BluetoothDevice.PHY_LE_2M)
                .build()

            val advertiseData = AdvertiseData.Builder()
                .addServiceUuid(BleConstants.PARCEL_SERVICE_UUID)
                .addServiceData(BleConstants.PARCEL_SERVICE_UUID, packetBytes)
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .build()

            val callback = object : AdvertisingSetCallback() {
                override fun onAdvertisingSetStarted(
                    advertisingSet: AdvertisingSet?,
                    txPower: Int,
                    status: Int
                ) {
                    if (status == ADVERTISE_SUCCESS) {
                        Log.i(TAG, "Extended advertising set started successfully")
                        currentAdvertisingSet = advertisingSet
                        isAdvertising = true
                        onAdvertisingStarted?.invoke()
                    } else {
                        Log.w(TAG, "Extended advertising failed with status: $status, falling back to legacy")
                        startLegacyChunkedAdvertising(packetBytes, null)
                    }
                }

                override fun onAdvertisingSetStopped(advertisingSet: AdvertisingSet?) {
                    Log.i(TAG, "Extended advertising set stopped")
                    isAdvertising = false
                    currentAdvertisingSet = null
                    onAdvertisingStopped?.invoke()
                }
            }

            advertiser?.startAdvertisingSet(parameters, advertiseData, null, null, null, callback)
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException starting extended advertising: ${e.message}")
            onAdvertisingError?.invoke(-2, "Missing BLUETOOTH_ADVERTISE permission")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting extended advertising, falling back: ${e.message}")
            startLegacyChunkedAdvertising(packetBytes, null)
        }
    }

    /**
     * Starts Legacy Advertising with manufacturer-data chunking for legacy hardware
     */
    private fun startLegacyChunkedAdvertising(packetBytes: ByteArray, messageId: ByteArray?) {
        val correlationId = messageId?.take(2)?.toByteArray() ?: byteArrayOf(packetBytes[0], packetBytes[1])
        activeChunks = partitionIntoChunks(packetBytes, correlationId)
        currentChunkIndex = 0

        if (activeChunks.isEmpty()) {
            Log.e(TAG, "No chunks generated to advertise")
            return
        }

        isAdvertising = true
        onAdvertisingStarted?.invoke()

        if (activeChunks.size == 1) {
            // Single chunk directly advertised
            advertiseLegacyChunk(activeChunks[0])
        } else {
            // Cycle through chunks continuously
            cycleLegacyChunks()
        }
    }

    private fun cycleLegacyChunks() {
        if (!isAdvertising || activeChunks.isEmpty()) return

        val chunk = activeChunks[currentChunkIndex]
        advertiseLegacyChunk(chunk)

        currentChunkIndex = (currentChunkIndex + 1) % activeChunks.size

        legacyCycleRunnable = Runnable { cycleLegacyChunks() }
        mainHandler.postDelayed(legacyCycleRunnable!!, CHUNK_CYCLE_INTERVAL_MS)
    }

    private fun advertiseLegacyChunk(chunkBytes: ByteArray) {
        try {
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            val advertiseData = AdvertiseData.Builder()
                .addServiceUuid(BleConstants.PARCEL_SERVICE_UUID)
                .addManufacturerData(BleConstants.MANUFACTURER_ID, chunkBytes)
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .build()

            advertiser?.stopAdvertising(legacyAdvertiseCallback)
            advertiser?.startAdvertising(settings, advertiseData, legacyAdvertiseCallback)
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException during legacy chunk advertising: ${e.message}")
            onAdvertisingError?.invoke(-2, "Missing BLUETOOTH_ADVERTISE permission")
        } catch (e: Exception) {
            Log.e(TAG, "Error advertising legacy chunk: ${e.message}")
            onAdvertisingError?.invoke(-3, e.message ?: "Legacy advertising failed")
        }
    }

    private val legacyAdvertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "Legacy chunk advertise success")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.w(TAG, "Legacy chunk advertise failed with code: $errorCode")
            onAdvertisingError?.invoke(errorCode, "Legacy advertising failed with code $errorCode")
        }
    }

    /**
     * Slices an emergency packet into wire chunks:
     * Header (4B): totalChunks(1B) | chunkIndex(1B) | correlationId(2B)
     * Payload: up to 20 bytes
     */
    fun partitionIntoChunks(packetBytes: ByteArray, correlationId: ByteArray): List<ByteArray> {
        val totalChunks = ((packetBytes.size + BleConstants.LEGACY_CHUNK_DATA_SIZE - 1) /
                BleConstants.LEGACY_CHUNK_DATA_SIZE).coerceAtLeast(1)

        val chunks = mutableListOf<ByteArray>()
        for (i in 0 until totalChunks) {
            val start = i * BleConstants.LEGACY_CHUNK_DATA_SIZE
            val end = (start + BleConstants.LEGACY_CHUNK_DATA_SIZE).coerceAtMost(packetBytes.size)
            val chunkPayload = packetBytes.copyOfRange(start, end)

            val chunkBuffer = ByteBuffer.allocate(BleConstants.LEGACY_CHUNK_HEADER_SIZE + chunkPayload.size)
            chunkBuffer.put(totalChunks.toByte())
            chunkBuffer.put(i.toByte())
            chunkBuffer.put(correlationId[0])
            chunkBuffer.put(correlationId[1])
            chunkBuffer.put(chunkPayload)

            chunks.add(chunkBuffer.array())
        }
        return chunks
    }

    /**
     * Halts all active advertising sets and legacy rotation loops
     */
    @Synchronized
    fun stopAdvertising() {
        legacyCycleRunnable?.let { mainHandler.removeCallbacks(it) }
        legacyCycleRunnable = null
        activeChunks = emptyList()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && currentAdvertisingSet != null) {
                advertiser?.stopAdvertisingSet(object : AdvertisingSetCallback() {})
                currentAdvertisingSet = null
            }
            advertiser?.stopAdvertising(legacyAdvertiseCallback)
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping advertiser: ${e.message}")
        } finally {
            isAdvertising = false
            onAdvertisingStopped?.invoke()
        }
    }
}
