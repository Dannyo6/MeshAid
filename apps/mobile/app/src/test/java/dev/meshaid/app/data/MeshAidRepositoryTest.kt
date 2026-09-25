package dev.meshaid.app.data

import dev.meshaid.app.data.local.dao.FakeMeshAidDao
import dev.meshaid.app.domain.models.Priority
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MeshAidRepositoryTest {

    private lateinit var fakeDao: FakeMeshAidDao
    private lateinit var repository: MeshAidRepository

    @Before
    fun setUp() {
        fakeDao = FakeMeshAidDao()
        repository = MeshAidRepository(fakeDao)
    }

    @Test
    fun testInsertOutboundMessage_persistsEmergencyPacket() = runTest {
        val result = repository.insertOutboundMessage(
            priority = Priority.CIVILIAN_SOS,
            notes = "Injured hiker at ridge line",
            headcount = 2,
            latitude = 37.7749f,
            longitude = -122.4194f
        )

        assertEquals(MeshAidRepository.IngestResult.ACCEPTED, result)

        val pending = repository.getPendingQueue()
        assertEquals(1, pending.size)
        assertEquals(Priority.CIVILIAN_SOS.tier, pending[0].priority)
        assertEquals(37.7749f, pending[0].latitude)
        assertEquals(-122.4194f, pending[0].longitude)
    }

    @Test
    fun testObserveSeenAndPendingCounts_updateOnInsert() = runTest {
        assertEquals(0, repository.observePendingCount().first())
        assertEquals(0, repository.observeSeenCount().first())

        repository.insertOutboundMessage(
            priority = Priority.RESOURCE_LOGISTICS,
            notes = "Need drinking water and insulin",
            headcount = 5
        )

        assertEquals(1, repository.observePendingCount().first())
        assertEquals(1, repository.observeSeenCount().first())

        val recents = repository.observeRecentMessages().first()
        assertEquals(1, recents.size)
        assertEquals(Priority.RESOURCE_LOGISTICS.tier, recents[0].priority)
    }

    @Test
    fun testInsertOutboundMessage_duplicateSuppression() = runTest {
        val packet = dev.meshaid.app.protocol.MeshAidPacket(
            version = 1,
            priority = Priority.GENERAL_INFO,
            hopCount = 0,
            messageId = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8),
            timestampSeconds = System.currentTimeMillis() / 1000L,
            ttlSeconds = 3600L,
            payload = "Road blocked".toByteArray()
        )

        val result1 = repository.insertOutboundMessage(packet)
        assertEquals(MeshAidRepository.IngestResult.ACCEPTED, result1)

        val result2 = repository.insertOutboundMessage(packet)
        assertEquals(MeshAidRepository.IngestResult.DUPLICATE, result2)
    }
}
