package dev.meshaid.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import dev.meshaid.app.ble.BleAdvertiserManager
import dev.meshaid.app.ble.BleScannerManager
import dev.meshaid.app.protocol.MeshAidPacket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Android Foreground Service maintaining continuous scanning and cyclic advertisement
 * of queued emergency packets without being suspended by Doze mode.
 */
class MeshRelayService : Service() {

    companion object {
        private const val TAG = "MeshRelayService"
        private const val NOTIFICATION_ID = 8201
        private const val CHANNEL_ID = "meshaid_relay_channel"
        private const val CHANNEL_NAME = "MeshAid Emergency Relay"
        private const val CYCLIC_ADVERTISE_INTERVAL_MS = 2500L
        private const val MAX_QUEUE_SIZE = 100
        private const val MAX_RELAY_HOPS = 7

        const val ACTION_START_RELAY = "dev.meshaid.app.action.START_RELAY"
        const val ACTION_STOP_RELAY = "dev.meshaid.app.action.STOP_RELAY"
    }

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Default + serviceJob)

    private lateinit var advertiserManager: BleAdvertiserManager
    private lateinit var scannerManager: BleScannerManager
    private var wakeLock: PowerManager.WakeLock? = null

    // Relay queue: thread-safe copy-on-write list prioritized by emergency tier
    private val packetQueue = CopyOnWriteArrayList<MeshAidPacket>()
    private val processedMessageIds = ConcurrentHashMap<String, Long>()

    private val _relayedPacketsFlow = MutableSharedFlow<MeshAidPacket>(extraBufferCapacity = 64)
    val relayedPacketsFlow: SharedFlow<MeshAidPacket> = _relayedPacketsFlow.asSharedFlow()

    private val binder = LocalBinder()

    inner class LocalBinder : Binder() {
        fun getService(): MeshRelayService = this@MeshRelayService
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing MeshRelayService")

        advertiserManager = BleAdvertiserManager(this)
        scannerManager = BleScannerManager(this)

        acquireWakeLock()
        createNotificationChannel()
        startForegroundServiceWithNotification()

        setupInboundPacketHandling()
        startCyclicAdvertisingLoop()
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

    /**
     * Enqueues an emergency packet for cyclic relay advertisement
     */
    fun enqueuePacket(packet: MeshAidPacket) {
        if (packet.isExpired()) {
            Log.w(TAG, "Refusing to enqueue expired packet: ${packet.messageIdHex}")
            return
        }

        // Avoid exact duplicate in active queue
        if (packetQueue.any { it.messageIdHex == packet.messageIdHex }) {
            return
        }

        packetQueue.add(packet)
        sortQueueByPriority()

        // Trim queue if size exceeds max bound
        while (packetQueue.size > MAX_QUEUE_SIZE) {
            packetQueue.removeAt(packetQueue.lastIndex)
        }

        Log.i(TAG, "Enqueued packet ${packet.messageIdHex} (Priority: ${packet.priority}, QueueSize: ${packetQueue.size})")
    }

    fun getQueuedPackets(): List<MeshAidPacket> = packetQueue.toList()

    private fun sortQueueByPriority() {
        packetQueue.sortWith(
            compareBy<MeshAidPacket> { it.priority.tier }
                .thenByDescending { it.timestampSeconds }
        )
    }

    private fun setupInboundPacketHandling() {
        scannerManager.onPacketReceived = { inboundPacket ->
            val msgId = inboundPacket.messageIdHex
            val now = System.currentTimeMillis()

            // Deduplication: prevent infinite loops across peers
            val lastSeen = processedMessageIds[msgId]
            if (lastSeen == null || (now - lastSeen) > 60_000L) {
                processedMessageIds[msgId] = now

                Log.i(TAG, "Relaying inbound packet: $msgId (Hops: ${inboundPacket.hopCount})")
                _relayedPacketsFlow.tryEmit(inboundPacket)

                // Store-carry-forward: increment hop count and re-queue if under max hops
                if (inboundPacket.hopCount < MAX_RELAY_HOPS) {
                    val relayedCopy = inboundPacket.copy(hopCount = inboundPacket.hopCount + 1)
                    enqueuePacket(relayedCopy)
                }
            }
        }
    }

    /**
     * Cyclic advertisement loop: rotates through queued emergency packets
     */
    private fun startCyclicAdvertisingLoop() {
        serviceScope.launch {
            var currentIdx = 0
            while (isActive) {
                // Purge expired packets
                val nowSeconds = System.currentTimeMillis() / 1000L
                packetQueue.removeAll { it.isExpired(nowSeconds) }

                if (packetQueue.isNotEmpty()) {
                    currentIdx = currentIdx % packetQueue.size
                    val packetToBroadcast = packetQueue[currentIdx]

                    Log.d(TAG, "Cyclic broadcasting packet: ${packetToBroadcast.messageIdHex} (Tier: ${packetToBroadcast.priority})")
                    advertiserManager.broadcastPacket(packetToBroadcast)

                    currentIdx = (currentIdx + 1) % packetQueue.size
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

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "Destroying MeshRelayService")
        serviceScope.cancel()
        scannerManager.stopScan()
        advertiserManager.stopAdvertising()
        releaseWakeLock()
    }
}
