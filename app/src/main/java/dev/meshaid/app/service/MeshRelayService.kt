package dev.meshaid.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import dev.meshaid.app.ble.BleAdvertiserManager
import dev.meshaid.app.ble.BleScannerManager
import dev.meshaid.app.data.MeshAidRepository
import dev.meshaid.app.data.MeshAidRepository.IngestResult
import dev.meshaid.app.data.local.MeshAidDatabase
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.net.GatewaySyncManager
import dev.meshaid.app.protocol.MeshAidPacket
import dev.meshaid.app.protocol.MeshAidPacketCodec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Android Foreground Service maintaining continuous scanning and cyclic advertisement
 * of queued emergency packets without being suspended by Doze mode.
 *
 * ### Phase 3 changes
 * The in-memory [CopyOnWriteArrayList] / [ConcurrentHashMap] pair has been replaced by
 * [MeshAidRepository], which persists packets to Room and provides:
 * - Priority-ranked, TTL-filtered queue snapshots.
 * - Atomic deduplication via the seen-packet cache.
 * - Automatic expiry pruning and overflow eviction.
 *
 * The cyclic advertising loop now reads directly from the Room-backed repository,
 * so no queue state is lost if the process is restarted by the OS.
 */
class MeshRelayService : Service() {

    companion object {
        private const val TAG = "MeshRelayService"
        private const val NOTIFICATION_ID = 8201
        private const val CHANNEL_ID = "meshaid_relay_channel"
        private const val CHANNEL_NAME = "MeshAid Emergency Relay"
        private const val CYCLIC_ADVERTISE_INTERVAL_MS = 2500L
        private const val MAX_RELAY_HOPS = 7

        const val ACTION_START_RELAY = "dev.meshaid.app.action.START_RELAY"
        const val ACTION_STOP_RELAY = "dev.meshaid.app.action.STOP_RELAY"

        private val _isServiceRunning = MutableStateFlow(false)
        val isServiceRunning: StateFlow<Boolean> = _isServiceRunning.asStateFlow()
    }

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Default + serviceJob)

    private lateinit var advertiserManager: BleAdvertiserManager
    private lateinit var scannerManager: BleScannerManager
    private lateinit var repository: MeshAidRepository
    private lateinit var gatewaySyncManager: GatewaySyncManager
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private val _relayedPacketsFlow = MutableSharedFlow<MeshAidPacket>(extraBufferCapacity = 64)
    val relayedPacketsFlow: SharedFlow<MeshAidPacket> = _relayedPacketsFlow.asSharedFlow()

    private val binder = LocalBinder()

    inner class LocalBinder : Binder() {
        fun getService(): MeshRelayService = this@MeshRelayService
        fun getGatewaySyncManager(): GatewaySyncManager = gatewaySyncManager
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing MeshRelayService (Phase 3 – Room-backed)")
        _isServiceRunning.value = true

        // Wire up Room-backed repository & Gateway Sync Manager
        val db = MeshAidDatabase.getInstance(applicationContext)
        repository = MeshAidRepository(db.meshAidDao())
        gatewaySyncManager = GatewaySyncManager(db.meshAidDao())

        advertiserManager = BleAdvertiserManager(this)
        scannerManager = BleScannerManager(this)

        acquireWakeLock()
        createNotificationChannel()
        startForegroundServiceWithNotification()

        setupInboundPacketHandling()
        startCyclicAdvertisingLoop()
        registerNetworkCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_RELAY -> {
                Log.i(TAG, "Stop relay action received")
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                Log.i(TAG, "Starting or maintaining active BLE transport mesh")
                scannerManager.startScan()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Enqueues an emergency packet for cyclic relay advertisement.
     *
     * Delegates to [MeshAidRepository.ingest], which handles deduplication,
     * TTL validation, encoding, and Room persistence.
     */
    fun enqueuePacket(packet: MeshAidPacket) {
        serviceScope.launch(Dispatchers.IO) {
            val result = repository.ingest(packet)
            when (result) {
                IngestResult.ACCEPTED -> {
                    Log.i(TAG, "Enqueued via repository: ${packet.messageIdHex}")
                    triggerImmediateAdvertising()
                }
                IngestResult.DUPLICATE -> Log.d(TAG, "Duplicate suppressed: ${packet.messageIdHex}")
                IngestResult.EXPIRED -> Log.w(TAG, "Packet expired at ingestion: ${packet.messageIdHex}")
                IngestResult.ERROR -> Log.e(TAG, "Failed to persist packet: ${packet.messageIdHex}")
            }
        }
    }

    /**
     * Wakes up and triggers an immediate advertising sweep for high-priority queued packets
     * without waiting for the cyclic interval timer.
     */
    fun triggerImmediateAdvertising() {
        serviceScope.launch(Dispatchers.IO) {
            val pendingQueue = repository.getPendingQueue()
            if (pendingQueue.isNotEmpty()) {
                val entityToBroadcast = pendingQueue.first()
                val packetToBroadcast = try {
                    MeshAidPacketCodec.decodePacket(entityToBroadcast.wireBytes)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decode packet for immediate advertising: ${e.message}")
                    null
                }
                if (packetToBroadcast != null) {
                    Log.i(TAG, "Triggering immediate BLE broadcast: ${entityToBroadcast.messageId} (priority=${entityToBroadcast.priority})")
                    advertiserManager.broadcastPacket(packetToBroadcast)
                    repository.markRelayed(entityToBroadcast.messageId)
                }
            }
        }
    }

    // ─── Inbound Packet Handling ──────────────────────────────────────────────

    private fun setupInboundPacketHandling() {
        scannerManager.onPacketReceived = { inboundPacket ->
            serviceScope.launch(Dispatchers.IO) {
                val result = repository.ingest(inboundPacket)

                if (result == IngestResult.ACCEPTED) {
                    Log.i(TAG, "Relaying inbound packet: ${inboundPacket.messageIdHex} (Hops: ${inboundPacket.hopCount})")
                    _relayedPacketsFlow.tryEmit(inboundPacket)

                    // Store-carry-forward: bump hop count and re-ingest for relay
                    if (inboundPacket.hopCount < MAX_RELAY_HOPS) {
                        val relayedCopy = inboundPacket.copy(hopCount = inboundPacket.hopCount + 1)
                        repository.ingest(relayedCopy)
                    }
                }
            }
        }
    }

    // ─── Cyclic Advertisement Loop ────────────────────────────────────────────

    /**
     * Runs the store-and-forward advertising loop:
     * 1. Maintenance sweep (expiry pruning + seen-cache compaction).
     * 2. Fetch the priority-ranked pending queue from Room.
     * 3. Round-robin broadcast each packet, marking it [RelayStatus.RELAYED] after success.
     */
    private fun startCyclicAdvertisingLoop() {
        serviceScope.launch(Dispatchers.IO) {
            var currentIdx = 0
            while (isActive) {
                // Step 1 – maintenance
                repository.runMaintenance()

                // Step 2 – fetch current queue snapshot
                val pendingQueue: List<MeshAidMessageEntity> = repository.getPendingQueue()

                if (pendingQueue.isNotEmpty()) {
                    currentIdx = currentIdx % pendingQueue.size
                    val entityToBroadcast = pendingQueue[currentIdx]

                    // Re-decode the wire bytes for the advertiser
                    val packetToBroadcast = try {
                        MeshAidPacketCodec.decodePacket(entityToBroadcast.wireBytes)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to decode queued packet ${entityToBroadcast.messageId}: ${e.message}")
                        null
                    }

                    if (packetToBroadcast != null) {
                        Log.d(TAG, "Cyclic broadcasting: ${entityToBroadcast.messageId} (priority=${entityToBroadcast.priority})")
                        advertiserManager.broadcastPacket(packetToBroadcast)
                        repository.markRelayed(entityToBroadcast.messageId)
                    }

                    currentIdx = (currentIdx + 1) % pendingQueue.size
                } else {
                    // Queue empty: halt active advertisement until new packets arrive
                    if (advertiserManager.isAdvertising) {
                        advertiserManager.stopAdvertising()
                    }
                }

                delay(CYCLIC_ADVERTISE_INTERVAL_MS)
            }
        }
    }

    // ─── Wake Lock ────────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
        wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "MeshAid:MeshRelayServiceWakeLock"
        )?.apply {
            setReferenceCounted(false)
            acquire(24 * 60 * 60 * 1000L) // 24-hour safety ceiling
        }
        Log.i(TAG, "Partial WakeLock acquired for Doze mode resilience")
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.i(TAG, "Partial WakeLock released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing wake lock: ${e.message}")
        }
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors and relays local civilian emergency broadcasts via BLE mesh"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MeshAid Emergency Relay Active")
            .setContentText("Scanning and relaying offline emergency packets via BLE")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun startForegroundServiceWithNotification() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    // ─── Network Connectivity & Gateway Sync ─────────────────────────────────

    private fun registerNetworkCallback() {
        try {
            connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val networkRequest = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.i(TAG, "Network connectivity with INTERNET acquired. Triggering gateway sync...")
                    serviceScope.launch(Dispatchers.IO) {
                        try {
                            val syncedCount = gatewaySyncManager.syncPendingMessages()
                            if (syncedCount > 0) {
                                Log.i(TAG, "Gateway sync completed: $syncedCount packets uploaded")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error during automatic gateway sync: ${e.message}", e)
                        }
                    }
                }
            }

            networkCallback?.let { callback ->
                connectivityManager?.registerNetworkCallback(networkRequest, callback)
                Log.i(TAG, "Registered NetworkCallback for NET_CAPABILITY_INTERNET")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to register NetworkCallback: ${e.message}")
        }
    }

    private fun unregisterNetworkCallback() {
        try {
            networkCallback?.let { callback ->
                connectivityManager?.unregisterNetworkCallback(callback)
                Log.i(TAG, "Unregistered NetworkCallback")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering NetworkCallback: ${e.message}")
        } finally {
            networkCallback = null
            connectivityManager = null
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "Destroying MeshRelayService")
        _isServiceRunning.value = false
        serviceScope.cancel()
        scannerManager.stopScan()
        advertiserManager.stopAdvertising()
        unregisterNetworkCallback()
        releaseWakeLock()
    }
}
