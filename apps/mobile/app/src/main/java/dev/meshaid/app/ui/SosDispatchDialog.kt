package dev.meshaid.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.meshaid.app.domain.models.Priority
import dev.meshaid.app.ui.theme.PriorityP1Red
import dev.meshaid.app.ui.theme.PriorityP2Amber
import dev.meshaid.app.ui.theme.PriorityP3Blue
import dev.meshaid.app.ui.theme.Slate400
import dev.meshaid.app.ui.theme.Slate700
import dev.meshaid.app.ui.theme.Slate800
import dev.meshaid.app.ui.theme.Slate900

/**
 * Triage dispatch item configuration
 */
private data class TriageOption(
    val priority: Priority,
    val code: String,
    val title: String,
    val description: String,
    val color: Color,
    val icon: ImageVector
)

private val TRIAGE_OPTIONS = listOf(
    TriageOption(
        priority = Priority.CIVILIAN_SOS,
        code = "P1",
        title = "SOS Emergency",
        description = "Immediate life hazard, rescue required, or entrapment",
        color = PriorityP1Red,
        icon = Icons.Default.Emergency
    ),
    TriageOption(
        priority = Priority.RESOURCE_LOGISTICS,
        code = "P2",
        title = "Supplies / Resource",
        description = "Medical gear, drinking water, rations, or generator power",
        color = PriorityP2Amber,
        icon = Icons.Default.Inventory2
    ),
    TriageOption(
        priority = Priority.GENERAL_INFO,
        code = "P3",
        title = "Information",
        description = "Road hazards, bridge washouts, or civilian muster points",
        color = PriorityP3Blue,
        icon = Icons.Default.Campaign
    )
)

/**
 * Stateful dialog wrapper connecting to [EmergencyViewModel].
 */
@Composable
fun SosDispatchDialog(
    viewModel: EmergencyViewModel,
    modifier: Modifier = Modifier
) {
    SosDispatchDialog(
        onDismissRequest = { viewModel.closeDispatchDialog() },
        onBroadcast = { priority, headcount, notes ->
            viewModel.broadcastEmergency(
                priority = priority,
                headcount = headcount,
                notes = notes
            )
        },
        modifier = modifier
    )
}

/**
 * Stateless Compose Dialog allowing dispatchers and civilians to create and broadcast
 * an urgent emergency bulletin across the BLE peer mesh.
 */
@Composable
fun SosDispatchDialog(
    onDismissRequest: () -> Unit,
    onBroadcast: (priority: Priority, headcount: Int, notes: String) -> Unit,
    modifier: Modifier = Modifier,
    isBroadcasting: Boolean = false
) {
    var selectedPriority by remember { mutableStateOf(Priority.CIVILIAN_SOS) }
    var headcountText by remember { mutableStateOf("1") }
    var notesText by remember { mutableStateOf("") }
    var showError by remember { mutableStateOf(false) }

    val scrollState = rememberScrollState()

    Dialog(
        onDismissRequest = onDismissRequest,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = modifier
                .fillMaxWidth(0.94f)
                .padding(vertical = 24.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(
                containerColor = Slate900
            ),
            border = BorderStroke(1.dp, Slate700)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(scrollState)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(PriorityP1Red.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = "Emergency SOS",
                                tint = PriorityP1Red,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Emergency Dispatch",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = "Offline BLE Mesh Broadcast",
                                style = MaterialTheme.typography.bodySmall,
                                color = Slate400
                            )
                        }
                    }

                    IconButton(onClick = onDismissRequest) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = Slate400
                        )
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Triage Level Section
                Text(
                    text = "TRIAGE LEVEL",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Slate400,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                TRIAGE_OPTIONS.forEach { option ->
                    val isSelected = selectedPriority == option.priority
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clickable { selectedPriority = option.priority },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (isSelected) option.color.copy(alpha = 0.15f) else Slate800
                        ),
                        border = BorderStroke(
                            width = if (isSelected) 2.dp else 1.dp,
                            color = if (isSelected) option.color else Slate700
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = option.color,
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = option.icon,
                                        contentDescription = option.code,
                                        tint = Color.White,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "${option.code} • ${option.title}",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSelected) Color.White else Slate400
                                    )
                                }
                                Text(
                                    text = option.description,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (isSelected) Slate400 else Slate400.copy(alpha = 0.7f),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Headcount Input
                Text(
                    text = "HEADCOUNT AT LOCATION",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Slate400,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = headcountText,
                    onValueChange = { input ->
                        if (input.isEmpty() || input.all { it.isDigit() }) {
                            headcountText = input
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Group,
                            contentDescription = "Headcount",
                            tint = Slate400
                        )
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Slate800,
                        unfocusedContainerColor = Slate800,
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = Slate700,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    singleLine = true,
                    placeholder = { Text("e.g. 1, 4, 10", color = Slate400) }
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Situation Notes Input
                Text(
                    text = "URGENT SITUATION NOTES",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Slate400,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = notesText,
                    onValueChange = {
                        notesText = it
                        if (it.isNotBlank()) showError = false
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Slate800,
                        unfocusedContainerColor = Slate800,
                        focusedBorderColor = if (showError) PriorityP1Red else MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = if (showError) PriorityP1Red else Slate700,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    placeholder = {
                        Text(
                            "Detail immediate hazards, GPS/landmarks, injuries, or urgently needed resources...",
                            color = Slate400,
                            fontSize = 13.sp
                        )
                    },
                    isError = showError
                )

                AnimatedVisibility(visible = showError) {
                    Text(
                        text = "Please enter situation notes before broadcasting",
                        color = PriorityP1Red,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp, start = 4.dp)
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismissRequest,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Slate700),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                    ) {
                        Text("Cancel")
                    }

                    Button(
                        onClick = {
                            if (notesText.isBlank()) {
                                showError = true
                            } else {
                                val headcount = headcountText.toIntOrNull()?.coerceAtLeast(1) ?: 1
                                onBroadcast(selectedPriority, headcount, notesText)
                            }
                        },
                        modifier = Modifier
                            .weight(1.6f)
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PriorityP1Red
                        ),
                        enabled = !isBroadcasting
                    ) {
                        if (isBroadcasting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Transmitting...")
                        } else {
                            Icon(
                                imageVector = Icons.Default.Emergency,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Broadcast Emergency", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
