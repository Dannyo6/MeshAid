package dev.meshaid.app.data.local.dao

import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.data.local.entity.SeenPacketEntity
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for [MeshAidDao] using an in-memory fake implementation.
 *
 * Because Room's annotation processor generates the real DAO implementation only during
 * a full Android build, these tests exercise a [FakeMeshAidDao] that mirrors the exact
 * SQL semantics defined in the interface – allowing fast, JVM-only test execution without
 * requiring an emulator or Robolectric.
 *
 * ### Coverage
 * - Deduplication: [FakeMeshAidDao.hasSeen] / [FakeMeshAidDao.insertSeen]
 * - Priority queue ordering (P0 < P1 < P2 < P3, newest-first tiebreaker)
 * - TTL expiry pruning ([FakeMeshAidDao.deleteExpiredMessages])
 * - Seen-cache compaction ([FakeMeshAidDao.pruneOldSeenPackets])
 * - Overflow eviction ([FakeMeshAidDao.evictLowPriorityPackets] / [FakeMeshAidDao.enforceQueueCap])
 * - Status update ([FakeMeshAidDao.updateRelayStatus])
 * - Live count flow ([FakeMeshAidDao.observePendingCount])
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MeshAidDaoTest {

    private lateinit var dao: FakeMeshAidDao

    @Before
    fun setUp() {
        dao = FakeMeshAidDao()
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun nowSeconds() = System.currentTimeMillis() / 1000L

    /** Builds a [MeshAidMessageEntity] with sensible defaults. */
    private fun message(
        id: String,
        priority: Int = 1,
        ttlOffset: Long = 300L,          // seconds from now (positive = future)
        isRelayed: Boolean = false,
        isSynced: Boolean = false,
        createdAtOffset: Long = 0L       // millis offset from now (negative = older)
    ): MeshAidMessageEntity {
        val now = System.currentTimeMillis()
        return MeshAidMessageEntity(
            messageId = id,
            priority = priority,
            hopCount = 0,
            createdAt = now + createdAtOffset,
            ttl = nowSeconds() + ttlOffset,
            latitude = 0f,
            longitude = 0f,
            rawPacket = id.toByteArray(),
            isRelayed = isRelayed,
            isSynced = isSynced
        )
    }

    // ─── Deduplication ───────────────────────────────────────────────────────

    @Test
    fun `hasSeen returns false for unknown messageId`() = runTest {
        assertFalse(dao.hasSeen("unknown-id"))
    }

    @Test
    fun `hasSeen returns true after insertSeen`() = runTest {
        dao.insertSeen(SeenPacketEntity("msg-abc"))
        assertTrue(dao.hasSeen("msg-abc"))
    }

    @Test
    fun `insertSeen ignores duplicate entries`() = runTest {
        dao.insertSeen(SeenPacketEntity("msg-dup"))
        dao.insertSeen(SeenPacketEntity("msg-dup")) // second insert should be silently ignored
        assertTrue(dao.hasSeen("msg-dup"))
    }

    // ─── Priority Queue Ordering ──────────────────────────────────────────────

    @Test
    fun `getPendingQueue orders by priority ASC then createdAt DESC`() = runTest {
        // Insert packets out of order
        dao.insertMessage(message("p3-old",  priority = 3, createdAtOffset = -5_000))
        dao.insertMessage(message("p0-new",  priority = 0, createdAtOffset = 0))
        dao.insertMessage(message("p1-mid",  priority = 1, createdAtOffset = -1_000))
        dao.insertMessage(message("p0-old",  priority = 0, createdAtOffset = -3_000))

        val queue = dao.getPendingQueue(nowSeconds())

        // Verify primary sort: priority ascending
        assertEquals("p0-new",  queue[0].messageId) // P0, newest
        assertEquals("p0-old",  queue[1].messageId) // P0, older
        assertEquals("p1-mid",  queue[2].messageId) // P1
        assertEquals("p3-old",  queue[3].messageId) // P3
    }

    @Test
    fun `getPendingQueue excludes expired packets`() = runTest {
        dao.insertMessage(message("live",    ttlOffset = +300L))  // future TTL
        dao.insertMessage(message("expired", ttlOffset = -1L))    // already past

        val queue = dao.getPendingQueue(nowSeconds())

        assertEquals(1, queue.size)
        assertEquals("live", queue[0].messageId)
    }

    @Test
    fun `getPendingQueue excludes relayed packets`() = runTest {
        dao.insertMessage(message("pending", isRelayed = false))
        dao.insertMessage(message("relayed", isRelayed = true))

        val queue = dao.getPendingQueue(nowSeconds())

        assertEquals(1, queue.size)
        assertEquals("pending", queue[0].messageId)
    }

    // ─── Expiry Pruning ───────────────────────────────────────────────────────

    @Test
    fun `deleteExpiredMessages removes only expired rows`() = runTest {
        dao.insertMessage(message("live",    ttlOffset = +300L))
        dao.insertMessage(message("expired", ttlOffset = -60L))

        val deleted = dao.deleteExpiredMessages(nowSeconds())

        assertEquals(1, deleted)
        val remaining = dao.getPendingQueue(nowSeconds())
        assertEquals(1, remaining.size)
        assertEquals("live", remaining[0].messageId)
    }

    @Test
    fun `deleteExpiredMessages returns 0 when nothing is expired`() = runTest {
        dao.insertMessage(message("live1", ttlOffset = +600L))
        dao.insertMessage(message("live2", ttlOffset = +300L))

        val deleted = dao.deleteExpiredMessages(nowSeconds())

        assertEquals(0, deleted)
    }

    // ─── Seen-Cache Pruning ───────────────────────────────────────────────────

    @Test
    fun `pruneOldSeenPackets removes entries older than cutoff`() = runTest {
        val oldTimestamp = System.currentTimeMillis() - 20 * 60 * 1000L // 20 min ago
        val freshTimestamp = System.currentTimeMillis() - 2 * 60 * 1000L  // 2 min ago

        dao.insertSeen(SeenPacketEntity("old-msg",   firstSeenAt = oldTimestamp))
        dao.insertSeen(SeenPacketEntity("fresh-msg", firstSeenAt = freshTimestamp))

        val cutoff = System.currentTimeMillis() - SeenPacketEntity.SEEN_TTL_MS
        val pruned = dao.pruneOldSeenPackets(cutoff)

        assertEquals(1, pruned)
        assertFalse(dao.hasSeen("old-msg"))
        assertTrue(dao.hasSeen("fresh-msg"))
    }

    // ─── Overflow Eviction ────────────────────────────────────────────────────

    @Test
    fun `evictLowPriorityPackets removes lowest-priority oldest rows`() = runTest {
        // 4 rows: P0 (critical) and P3 (low)
        dao.insertMessage(message("p0-a", priority = 0, createdAtOffset = -1_000))
        dao.insertMessage(message("p0-b", priority = 0, createdAtOffset = 0))
        dao.insertMessage(message("p3-a", priority = 3, createdAtOffset = -2_000))
        dao.insertMessage(message("p3-b", priority = 3, createdAtOffset = -1_000))

        // Drop 2 lowest-priority, oldest rows first
        dao.evictLowPriorityPackets(dropCount = 2)

        val remaining = dao.getPendingQueue(nowSeconds())
        // p3-a and p3-b should be evicted (priority=3, oldest)
        assertTrue(remaining.any { it.messageId == "p0-a" })
        assertTrue(remaining.any { it.messageId == "p0-b" })
        assertFalse(remaining.any { it.messageId == "p3-a" })
        assertFalse(remaining.any { it.messageId == "p3-b" })
    }

    @Test
    fun `enforceQueueCap evicts excess rows when over threshold`() = runTest {
        repeat(5) { i ->
            dao.insertMessage(message("msg-$i", priority = if (i < 2) 0 else 3))
        }
        assertEquals(5, dao.pendingCount())

        dao.enforceQueueCap(maxQueueSize = 3)

        assertTrue(dao.pendingCount() <= 3)
    }

    @Test
    fun `enforceQueueCap is no-op when under threshold`() = runTest {
        dao.insertMessage(message("msg-1", priority = 0))
        dao.insertMessage(message("msg-2", priority = 1))

        dao.enforceQueueCap(maxQueueSize = 10)

        assertEquals(2, dao.pendingCount())
    }

    // ─── Status Update ────────────────────────────────────────────────────────

    @Test
    fun `updateRelayStatus marks packet as relayed`() = runTest {
        dao.insertMessage(message("relay-me"))

        dao.updateRelayStatus("relay-me", isRelayed = true)

        // The queue should no longer contain it (relayed rows are excluded)
        val queue = dao.getPendingQueue(nowSeconds())
        assertFalse(queue.any { it.messageId == "relay-me" })
    }

    // ─── observePendingCount Flow ─────────────────────────────────────────────

    @Test
    fun `observePendingCount reflects current queue size`() = runTest {
        assertEquals(0, dao.observePendingCount().first())

        dao.insertMessage(message("m1"))
        dao.insertMessage(message("m2"))

        assertEquals(2, dao.observePendingCount().first())
    }

    // ─── Cloud Gateway Sync ───────────────────────────────────────────────────

    @Test
    fun `getUnsyncedMessages returns only unsynced messages ordered by priority ASC and createdAt DESC`() = runTest {
        dao.insertMessage(message("synced", priority = 0, isSynced = true))
        dao.insertMessage(message("p3-unsynced", priority = 3, isSynced = false, createdAtOffset = -5_000))
        dao.insertMessage(message("p0-old-unsynced", priority = 0, isSynced = false, createdAtOffset = -2_000))
        dao.insertMessage(message("p0-new-unsynced", priority = 0, isSynced = false, createdAtOffset = 0))

        val unsynced = dao.getUnsyncedMessages(50)

        assertEquals(3, unsynced.size)
        assertEquals("p0-new-unsynced", unsynced[0].messageId)
        assertEquals("p0-old-unsynced", unsynced[1].messageId)
        assertEquals("p3-unsynced", unsynced[2].messageId)
        assertFalse(unsynced.any { it.messageId == "synced" })
    }

    @Test
    fun `getUnsyncedMessages respects limit`() = runTest {
        repeat(5) { i ->
            dao.insertMessage(message("msg-$i", priority = i, isSynced = false))
        }

        val limited = dao.getUnsyncedMessages(limit = 2)

        assertEquals(2, limited.size)
        assertEquals("msg-0", limited[0].messageId)
        assertEquals("msg-1", limited[1].messageId)
    }

    @Test
    fun `markAsSynced marks specified message IDs as synced`() = runTest {
        dao.insertMessage(message("m1", isSynced = false))
        dao.insertMessage(message("m2", isSynced = false))
        dao.insertMessage(message("m3", isSynced = false))

        assertEquals(3, dao.getUnsyncedMessages().size)

        dao.markAsSynced(listOf("m1", "m3"))

        val remainingUnsynced = dao.getUnsyncedMessages()
        assertEquals(1, remainingUnsynced.size)
        assertEquals("m2", remainingUnsynced[0].messageId)
    }

    @Test
    fun `markAsSynced with empty list is no-op`() = runTest {
        dao.insertMessage(message("m1", isSynced = false))

        dao.markAsSynced(emptyList())

        assertEquals(1, dao.getUnsyncedMessages().size)
    }
}
