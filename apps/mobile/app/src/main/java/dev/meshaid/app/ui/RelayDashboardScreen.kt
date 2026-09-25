package dev.meshaid.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAlert
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.BluetoothConnected
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Numbers
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.protocol.MeshAidPacketCodec
import dev.meshaid.app.ui.theme.ActiveRelayGreen
import dev.meshaid.app.ui.theme.EmergencyRed
import dev.meshaid.app.ui.theme.PriorityP0Red
import dev.meshaid.app.ui.theme.PriorityP1Red
import dev.meshaid.app.ui.theme.PriorityP2Amber
import dev.meshaid.app.ui.theme.PriorityP3Blue
import dev.meshaid.app.ui.theme.RadioCyan
import dev.meshaid.app.ui.theme.Slate100
import dev.meshaid.app.ui.theme.Slate300
import dev.meshaid.app.ui.theme.Slate400
import dev.meshaid.app.ui.theme.Slate700
import dev.meshaid.app.ui.theme.Slate800
import dev.meshaid.app.ui.theme.Slate900
import dev.meshaid.app.ui.theme.Slate950
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Main dashboard screen providing:
 * 1. Persistent background [dev.meshaid.app.service.MeshRelayService] toggle.
 * 2. Live telemetry meters (Deduplication Cache Size, Outbound Packets in Custody).
 * 3. Reactive [LazyColumn] of recent emergency bulletins with priority-coded badges.
 * 4. Dispatch emergency action button launching [SosDispatchDialog].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RelayDashboardScreen(
    viewModel: EmergencyViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.userFeedbackMessage) {
        uiState.userFeedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearFeedbackMessage()
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = Slate950,
        topBar = {
            RelayTopAppBar(isServiceRunning = uiState.isServiceRunning)
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { viewModel.openDispatchDialog() },
                containerColor = EmergencyRed,
                contentColor = Color.White,
                icon = { Icon(Icons.Default.Emergency, contentDescription = null) },
                text = { Text("SOS DISPATCH", fontWeight = FontWeight.Bold) },
                shape = RoundedCornerShape(16.dp)
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Persistent service switch banner
            ServiceStatusBanner(
                isServiceRunning = uiState.isServiceRunning,
                onToggleService = { viewModel.toggleRelayService() }
            )

            // Real-time telemetry metrics cards
            TelemetryCardsRow(
                activeRelayCount = uiState.activeRelayCount,
                seenPacketsCount = uiState.seenPacketsCount
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Bulletins section header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Sensors,
                        contentDescription = null,
                        tint = RadioCyan,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "LIVE MESH BULLETINS & CUSTODY",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = Slate300,
                        letterSpacing = 1.sp
                    )
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Slate800,
                    border = BorderStroke(1.dp, Slate700)
                ) {
                    Text(
                        text = "${uiState.recentBulletins.size} recorded",
                        style = MaterialTheme.typography.labelSmall,
                        color = Slate400,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            // LazyColumn of bulletins / packets
            if (uiState.recentBulletins.isEmpty()) {
                EmptyBulletinsPlaceholder(isServiceRunning = uiState.isServiceRunning)
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(
                        items = uiState.recentBulletins,
                        key = { it.messageId }
                    ) { bulletin ->
                        BulletinItemCard(bulletin = bulletin)
                    }
                }
            }
        }
    }

    // SOS Dispatch Dialog
    if (uiState.isDispatchDialogOpen) {
        SosDispatchDialog(viewModel = viewModel)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RelayTopAppBar(isServiceRunning: Boolean) {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(if (isServiceRunning) ActiveRelayGreen else PriorityP1Red)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "MeshAid Relay Telemetry",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = if (isServiceRunning) "BLE Mesh Engine Active" else "Relay Engine Paused",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate400,
                        fontSize = 11.sp
                    )
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Slate900
        )
    )
}

/**
 * Persistent service status card with toggle switch
 */
@Composable
private fun ServiceStatusBanner(
    isServiceRunning: Boolean,
    onToggleService: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Slate900
        ),
        border = BorderStroke(
            1.dp,
            if (isServiceRunning) ActiveRelayGreen.copy(alpha = 0.5f) else Slate700
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            if (isServiceRunning) ActiveRelayGreen.copy(alpha = 0.15f)
                            else Slate800
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isServiceRunning) Icons.Default.BluetoothConnected else Icons.Default.Bluetooth,
                        contentDescription = null,
                        tint = if (isServiceRunning) ActiveRelayGreen else Slate400,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = if (isServiceRunning) "RELAY ENGINE RUNNING" else "RELAY ENGINE INACTIVE",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (isServiceRunning) ActiveRelayGreen else Slate400
                        )
                        if (isServiceRunning) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(ActiveRelayGreen.copy(alpha = pulseAlpha))
                            )
                        }
                    }
                    Text(
                        text = if (isServiceRunning)
                            "Continuous BLE scanning & cyclic store-and-forward"
                        else
                            "Toggle to start background emergency relay",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate400,
                        fontSize = 11.sp
                    )
                }
            }

            Switch(
                checked = isServiceRunning,
                onCheckedChange = { onToggleService() },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = ActiveRelayGreen,
                    uncheckedThumbColor = Slate400,
                    uncheckedTrackColor = Slate800
                )
            )
        }
    }
}

/**
 * Real-time telemetry cards: Deduplication Cache Size & Outbound Packets in Custody
 */
@Composable
private fun TelemetryCardsRow(
    activeRelayCount: Int,
    seenPacketsCount: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Outbound Packets in Custody
        TelemetryCard(
            title = "PACKETS IN CUSTODY",
            count = activeRelayCount,
            subtitle = "Queued for cyclic BLE broadcast",
            icon = Icons.Default.CloudQueue,
            accentColor = RadioCyan,
            modifier = Modifier.weight(1f)
        )

        // Deduplication Cache Size
        TelemetryCard(
            title = "DEDUP CACHE SIZE",
            count = seenPacketsCount,
            subtitle = "Unique packets recorded",
            icon = Icons.Default.Security,
            accentColor = PriorityP2Amber,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun TelemetryCard(
    title: String,
    count: Int,
    subtitle: String,
    icon: ImageVector,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Slate900),
        border = BorderStroke(1.dp, Slate700)
    ) {
        Column(
            modifier = Modifier.padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Slate400,
                    fontSize = 10.sp,
                    letterSpacing = 0.5.sp
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(16.dp)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = count.toString(),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Black,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = Slate400,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * Individual bulletin card displaying priority badge, packet ID, hops, and payload summary
 */
@Composable
private fun BulletinItemCard(
    bulletin: MeshAidMessageEntity,
    modifier: Modifier = Modifier
) {
    val (priorityLabel, priorityColor) = getPriorityBadgeInfo(bulletin.priority)
    val timeFormatted = remember(bulletin.createdAt) {
        SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(bulletin.createdAt))
    }

    // Attempt decoding raw packet payload for human-readable note display
    val decodedPayload = remember(bulletin.rawPacket) {
        try {
            val packet = MeshAidPacketCodec.decodePacket(bulletin.wireBytes)
            String(packet.payload, Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Slate900),
        border = BorderStroke(
            1.dp,
            if (bulletin.priority <= 1) priorityColor.copy(alpha = 0.4f) else Slate700
        )
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Top row: Priority Badge + ID + Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Priority Badge
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = priorityColor,
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Text(
                            text = priorityLabel,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            fontSize = 11.sp
                        )
                    }

                    // Message ID Slice
                    Text(
                        text = "ID: ${bulletin.messageId.take(8)}...",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = Slate300,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Relayed or Pending Pill
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (bulletin.isRelayed) ActiveRelayGreen.copy(alpha = 0.15f) else PriorityP2Amber.copy(alpha = 0.15f),
                    border = BorderStroke(
                        1.dp,
                        if (bulletin.isRelayed) ActiveRelayGreen.copy(alpha = 0.5f) else PriorityP2Amber.copy(alpha = 0.5f)
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(if (bulletin.isRelayed) ActiveRelayGreen else PriorityP2Amber)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (bulletin.isRelayed) "RELAYED" else "IN CUSTODY",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (bulletin.isRelayed) ActiveRelayGreen else PriorityP2Amber,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Decoded Payload / Situation Text
            if (!decodedPayload.isNullOrBlank()) {
                Text(
                    text = decodedPayload,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Slate100,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(10.dp))
            }

            // Footer metadata: Hops, Time, GPS
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "Hops: ${bulletin.hopCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate400,
                        fontSize = 11.sp
                    )

                    Text(
                        text = "•",
                        color = Slate700,
                        fontSize = 11.sp
                    )

                    Text(
                        text = timeFormatted,
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate400,
                        fontSize = 11.sp
                    )
                }

                if (!bulletin.latitude.isNaN() && !bulletin.longitude.isNaN()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = "GPS",
                            tint = RadioCyan,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(2.dp))
                        Text(
                            text = "%.3f, %.3f".format(bulletin.latitude, bulletin.longitude),
                            style = MaterialTheme.typography.bodySmall,
                            color = RadioCyan,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }
    }
}

/**
 * Returns badge label and priority color:
 * Red for P0 (Emergency Authority) and P1 (Civilian SOS)
 * Amber for P2 (Resource Logistics)
 * Blue for P3 (General Info)
 */
private fun getPriorityBadgeInfo(priorityTier: Int): Pair<String, Color> {
    return when (priorityTier) {
        0 -> "P0 AUTHORITY" to PriorityP0Red
        1 -> "P1 SOS" to PriorityP1Red
        2 -> "P2 SUPPLIES" to PriorityP2Amber
        3 -> "P3 INFO" to PriorityP3Blue
        else -> "P$priorityTier" to PriorityP3Blue
    }
}

@Composable
private fun EmptyBulletinsPlaceholder(isServiceRunning: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 40.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Slate900),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Sensors,
                    contentDescription = null,
                    tint = Slate400,
                    modifier = Modifier.size(32.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "No Packets in Custody",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Slate300
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = if (isServiceRunning)
                    "Relay service is listening for peer broadcasts. Inbound emergency packets will appear here in real-time."
                else
                    "Start the Relay Engine to begin scanning and propagating emergency BLE broadcasts.",
                style = MaterialTheme.typography.bodySmall,
                color = Slate400,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                fontSize = 12.sp
            )
        }
    }
}
