package dev.meshaid.app.ui

import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EmergencyUiStateTest {

    @Test
    fun testDefaultState() {
        val state = EmergencyUiState()
        assertEquals(0, state.activeRelayCount)
        assertEquals(0, state.seenPacketsCount)
        assertFalse(state.isServiceRunning)
        assertTrue(state.recentBulletins.isEmpty())
        assertFalse(state.isDispatchDialogOpen)
        assertFalse(state.isBroadcasting)
    }

    @Test
    fun testUpdatedState() {
        val dummyEntity = MeshAidMessageEntity(
            messageId = "0102030405060708",
            priority = 1,
            ttl = 1000L,
            rawPacket = byteArrayOf()
        )

        val state = EmergencyUiState(
            activeRelayCount = 3,
            seenPacketsCount = 12,
            isServiceRunning = true,
            recentBulletins = listOf(dummyEntity),
            isDispatchDialogOpen = true
        )

        assertEquals(3, state.activeRelayCount)
        assertEquals(12, state.seenPacketsCount)
        assertTrue(state.isServiceRunning)
        assertEquals(1, state.recentBulletins.size)
        assertTrue(state.isDispatchDialogOpen)
    }
}
