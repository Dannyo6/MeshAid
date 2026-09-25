package dev.meshaid.app.ui

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.meshaid.app.data.MeshAidRepository
import dev.meshaid.app.data.MeshAidRepository.IngestResult
import dev.meshaid.app.data.local.MeshAidDatabase
import dev.meshaid.app.domain.models.Priority
import dev.meshaid.app.service.MeshRelayService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * ViewModel orchestrating emergency dispatch workflows and live BLE relay telemetry.
 *
 * Connects [MeshAidRepository] Room reactive streams with [MeshRelayService] lifecycle
 * and exposes unified [EmergencyUiState] to Jetpack Compose screens.
 */
class EmergencyViewModel(
    application: Application,
    private val repository: MeshAidRepository = MeshAidRepository(
        MeshAidDatabase.getInstance(application).meshAidDao()
    )
) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "EmergencyViewModel"
    }

    private val context: Context get() = getApplication<Application>().applicationContext

    private val isDispatchDialogOpen = MutableStateFlow(false)
    private val isBroadcasting = MutableStateFlow(false)
    private val userFeedbackMessage = MutableStateFlow<String?>(null)

    // Bound service instance
    private var relayService: MeshRelayService? = null
    private val isBound = MutableStateFlow(false)

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.i(TAG, "Connected to MeshRelayService")
            val binder = service as? MeshRelayService.LocalBinder
            relayService = binder?.getService()
            isBound.value = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.i(TAG, "Disconnected from MeshRelayService")
            relayService = null
            isBound.value = false
        }
    }

    init {
        // Attempt binding if service is already running
        bindToRelayService()
    }

    private data class TelemetryData(
        val pendingCount: Int = 0,
        val seenCount: Int = 0,
        val isRunning: Boolean = false,
        val recentBulletins: List<dev.meshaid.app.data.local.entity.MeshAidMessageEntity> = emptyList()
    )

    private val telemetryFlow = combine(
        repository.observePendingCount(),
        repository.observeSeenCount(),
        MeshRelayService.isServiceRunning,
        repository.observeRecentMessages()
    ) { pendingCount, seenCount, isRunning, recentBulletins ->
        TelemetryData(pendingCount, seenCount, isRunning, recentBulletins)
    }

    /**
     * Unified UI State combining telemetry from Room database and relay service.
     */
    val uiState: StateFlow<EmergencyUiState> = combine(
        telemetryFlow,
        isDispatchDialogOpen,
        isBroadcasting,
        userFeedbackMessage
    ) { telemetry, dialogOpen, broadcasting, feedback ->
        EmergencyUiState(
            activeRelayCount = telemetry.pendingCount,
            seenPacketsCount = telemetry.seenCount,
            isServiceRunning = telemetry.isRunning,
            recentBulletins = telemetry.recentBulletins,
            isDispatchDialogOpen = dialogOpen,
            isBroadcasting = broadcasting,
            userFeedbackMessage = feedback
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000L),
        initialValue = EmergencyUiState()
    )

    // ─── Service Controls ─────────────────────────────────────────────────────

    fun toggleRelayService() {
        if (MeshRelayService.isServiceRunning.value) {
            stopRelayService()
        } else {
            startRelayService()
        }
    }

    fun startRelayService() {
        try {
            val intent = Intent(context, MeshRelayService::class.java).apply {
                action = MeshRelayService.ACTION_START_RELAY
            }
            ContextCompat.startForegroundService(context, intent)
            bindToRelayService()
            userFeedbackMessage.value = "Mesh Relay Service started"
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MeshRelayService: ${e.message}")
            userFeedbackMessage.value = "Failed to start service: ${e.message}"
        }
    }

    fun stopRelayService() {
        try {
            unbindFromRelayService()
            val intent = Intent(context, MeshRelayService::class.java).apply {
                action = MeshRelayService.ACTION_STOP_RELAY
            }
            context.startService(intent)
            userFeedbackMessage.value = "Mesh Relay Service stopped"
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop MeshRelayService: ${e.message}")
            userFeedbackMessage.value = "Failed to stop service: ${e.message}"
        }
    }

    private fun bindToRelayService() {
        try {
            val intent = Intent(context, MeshRelayService::class.java)
            context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            Log.w(TAG, "Could not bind to MeshRelayService: ${e.message}")
        }
    }

    private fun unbindFromRelayService() {
        if (isBound.value) {
            try {
                context.unbindService(serviceConnection)
            } catch (e: Exception) {
                Log.w(TAG, "Error unbinding MeshRelayService: ${e.message}")
            } finally {
                isBound.value = false
                relayService = null
            }
        }
    }

    // ─── Emergency Dispatcher ─────────────────────────────────────────────────

    fun openDispatchDialog() {
        isDispatchDialogOpen.value = true
    }

    fun closeDispatchDialog() {
        isDispatchDialogOpen.value = false
    }

    fun clearFeedbackMessage() {
        userFeedbackMessage.value = null
    }

    /**
     * Broadcasts an emergency dispatch:
     * 1. Inserts into [MeshAidRepository] (persists to Room queue with deduplication).
     * 2. Triggers immediate cyclic BLE advertising.
     * 3. Ensures foreground relay service is running to sustain background propagation.
     */
    fun broadcastEmergency(
        priority: Priority,
        headcount: Int,
        notes: String,
        latitude: Float? = null,
        longitude: Float? = null
    ) {
        if (notes.isBlank()) {
            userFeedbackMessage.value = "Please provide details for the emergency notes"
            return
        }

        viewModelScope.launch(Dispatchers.IO) {
            isBroadcasting.value = true
            try {
                // Ensure service is running for continuous advertising
                if (!MeshRelayService.isServiceRunning.value) {
                    startRelayService()
                }

                val result = repository.insertOutboundMessage(
                    priority = priority,
                    notes = notes.trim(),
                    headcount = headcount.coerceAtLeast(1),
                    latitude = latitude,
                    longitude = longitude
                )

                when (result) {
                    IngestResult.ACCEPTED -> {
                        // Trigger immediate BLE broadcast
                        relayService?.triggerImmediateAdvertising()
                        userFeedbackMessage.value = "Emergency broadcast enqueued & BLE advertising triggered"
                        isDispatchDialogOpen.value = false
                    }
                    IngestResult.DUPLICATE -> {
                        userFeedbackMessage.value = "Identical message already active in queue"
                        isDispatchDialogOpen.value = false
                    }
                    IngestResult.EXPIRED -> {
                        userFeedbackMessage.value = "Message was discarded: TTL expired"
                    }
                    IngestResult.ERROR -> {
                        userFeedbackMessage.value = "Failed to encode/persist emergency message"
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error broadcasting emergency: ${e.message}", e)
                userFeedbackMessage.value = "Broadcast error: ${e.message}"
            } finally {
                isBroadcasting.value = false
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        unbindFromRelayService()
    }
}
