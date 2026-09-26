package dev.meshaid.app.net

import dev.meshaid.app.data.local.dao.FakeMeshAidDao
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Base64

/**
 * Mock implementation of [HttpTransport] for testing [GatewaySyncManager].
 */
class FakeHttpTransport(
    var responseCode: Int = 200,
    var shouldThrow: Boolean = false
) : HttpTransport {
    var lastUrl: String? = null
    var lastJson: String? = null
    var callCount: Int = 0

    override fun postJson(url: String, json: String): Int {
        callCount++
        lastUrl = url
        lastJson = json
        if (shouldThrow) {
            throw RuntimeException("Simulated socket connection timeout")
        }
        return responseCode
    }
}

/**
 * Unit tests for [GatewaySyncManager].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GatewaySyncManagerTest {

    private lateinit var dao: FakeMeshAidDao
    private lateinit var fakeTransport: FakeHttpTransport
    private lateinit var syncManager: GatewaySyncManager

    @Before
    fun setUp() {
        dao = FakeMeshAidDao()
        fakeTransport = FakeHttpTransport()
        syncManager = GatewaySyncManager(
            dao = dao,
            gatewayBaseUrl = "http://10.0.2.2:3000",
            httpTransport = fakeTransport
        )
    }

    private fun createEntity(
        id: String,
        priority: Int = 1,
        rawBytes: ByteArray = id.toByteArray(Charsets.UTF_8),
        isSynced: Boolean = false,
        createdAtOffset: Long = 0L
    ): MeshAidMessageEntity {
        val now = System.currentTimeMillis()
        return MeshAidMessageEntity(
            messageId = id,
            priority = priority,
            hopCount = 0,
            createdAt = now + createdAtOffset,
            ttl = (now / 1000L) + 3600L,
            latitude = 37.7749f,
            longitude = -122.4194f,
            rawPacket = rawBytes,
            isRelayed = false,
            isSynced = isSynced
        )
    }

    @Test
    fun `syncPendingMessages returns 0 and does not post when queue has no unsynced messages`() = runTest {
        // DAO empty
        val syncedCount = syncManager.syncPendingMessages()

        assertEquals(0, syncedCount)
        assertEquals(0, fakeTransport.callCount)
        assertNull(fakeTransport.lastUrl)
    }

    @Test
    fun `syncPendingMessages returns 0 when all messages are already synced`() = runTest {
        dao.insertMessage(createEntity("m1", isSynced = true))
        dao.insertMessage(createEntity("m2", isSynced = true))

        val syncedCount = syncManager.syncPendingMessages()

        assertEquals(0, syncedCount)
        assertEquals(0, fakeTransport.callCount)
    }

    @Test
    fun `syncPendingMessages posts valid JSON with Base64 frames and updates Room on HTTP 200`() = runTest {
        val raw1 = byteArrayOf(0x4D, 0x41, 0x01, 0x00, 0x10, 0x20)
        val raw2 = byteArrayOf(0x4D, 0x41, 0x02, 0x03, 0x50, 0x60)

        dao.insertMessage(createEntity("msg-1", rawBytes = raw1, isSynced = false))
        dao.insertMessage(createEntity("msg-2", rawBytes = raw2, isSynced = false))

        fakeTransport.responseCode = 200

        val syncedCount = syncManager.syncPendingMessages()

        assertEquals(2, syncedCount)
        assertEquals(1, fakeTransport.callCount)
        assertEquals("http://10.0.2.2:3000/api/mesh/sync", fakeTransport.lastUrl)

        // Verify JSON payload structure
        val expectedB64_1 = Base64.getEncoder().encodeToString(raw1)
        val expectedB64_2 = Base64.getEncoder().encodeToString(raw2)
        val expectedJson = "{\"packets\":[\"$expectedB64_1\",\"$expectedB64_2\"]}"
        assertEquals(expectedJson, fakeTransport.lastJson)

        // Verify DAO state: both messages should now be marked as synced
        val unsyncedRemaining = dao.getUnsyncedMessages()
        assertTrue(unsyncedRemaining.isEmpty())
    }

    @Test
    fun `syncPendingMessages marks messages as synced on HTTP 201 Created`() = runTest {
        dao.insertMessage(createEntity("msg-created", isSynced = false))
        fakeTransport.responseCode = 201

        val syncedCount = syncManager.syncPendingMessages()

        assertEquals(1, syncedCount)
        assertTrue(dao.getUnsyncedMessages().isEmpty())
    }

    @Test
    fun `syncPendingMessages does NOT mark messages as synced on HTTP 500 error`() = runTest {
        dao.insertMessage(createEntity("fail-msg", isSynced = false))
        fakeTransport.responseCode = 500

        val syncedCount = syncManager.syncPendingMessages()

        assertEquals(0, syncedCount)
        assertEquals(1, fakeTransport.callCount)

        // Message must remain un-synced in DAO for retry
        val unsynced = dao.getUnsyncedMessages()
        assertEquals(1, unsynced.size)
        assertEquals("fail-msg", unsynced[0].messageId)
        assertFalse(unsynced[0].isSynced)
    }

    @Test
    fun `syncPendingMessages does NOT mark messages as synced on network exception`() = runTest {
        dao.insertMessage(createEntity("timeout-msg", isSynced = false))
        fakeTransport.shouldThrow = true

        val syncedCount = syncManager.syncPendingMessages()

        assertEquals(0, syncedCount)
        assertEquals(1, fakeTransport.callCount)

        val unsynced = dao.getUnsyncedMessages()
        assertEquals(1, unsynced.size)
        assertEquals("timeout-msg", unsynced[0].messageId)
    }

    @Test
    fun `syncPendingMessages respects limit parameter`() = runTest {
        repeat(10) { i ->
            dao.insertMessage(createEntity("m-$i", priority = i, isSynced = false))
        }

        fakeTransport.responseCode = 200
        val syncedCount = syncManager.syncPendingMessages(limit = 4)

        assertEquals(4, syncedCount)
        val remaining = dao.getUnsyncedMessages(10)
        assertEquals(6, remaining.size)
    }

    @Test
    fun `buildJsonPayload formats packets array correctly`() {
        val packets = listOf("YWJj", "ZGVm", "MTIz")
        val json = syncManager.buildJsonPayload(packets)
        assertEquals("{\"packets\":[\"YWJj\",\"ZGVm\",\"MTIz\"]}", json)
    }

    @Test
    fun `gatewayBaseUrl handles trailing slashes properly`() = runTest {
        val customManager = GatewaySyncManager(
            dao = dao,
            gatewayBaseUrl = "http://192.168.1.50:3000/",
            httpTransport = fakeTransport
        )
        dao.insertMessage(createEntity("msg-slash", isSynced = false))

        customManager.syncPendingMessages()

        assertEquals("http://192.168.1.50:3000/api/mesh/sync", fakeTransport.lastUrl)
    }
}
