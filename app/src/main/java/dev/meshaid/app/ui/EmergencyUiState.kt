package dev.meshaid.app.ui

import dev.meshaid.app.data.local.entity.MeshAidMessageEntity

/**
 * Immutable UI state for the MeshAid Emergency Dispatcher and Relay Telemetry Screen.
 *
 * @property activeRelayCount Number of pending outbound packets currently in custody.
 * @property seenPacketsCount Number of deduplicated packets recorded in the local seen cache.
 * @property isServiceRunning Whether the background [dev.meshaid.app.service.MeshRelayService] is actively running.
 * @property recentBulletins Chronological list of recent emergency messages and packets in custody.
 * @property isDispatchDialogOpen Whether the SOS Dispatch dialog is currently visible.
 * @property isBroadcasting Whether an emergency broadcast is currently in-flight.
 * @property userFeedbackMessage Transient status message or error to display to the user.
 * @property isBatteryOptimizationIgnored Whether the application is exempt from Android Doze / battery optimizations.
 */
data class EmergencyUiState(
    val activeRelayCount: Int = 0,
    val seenPacketsCount: Int = 0,
    val isServiceRunning: Boolean = false,
    val recentBulletins: List<MeshAidMessageEntity> = emptyList(),
    val isDispatchDialogOpen: Boolean = false,
    val isBroadcasting: Boolean = false,
    val userFeedbackMessage: String? = null,
    val isBatteryOptimizationIgnored: Boolean = true
)
