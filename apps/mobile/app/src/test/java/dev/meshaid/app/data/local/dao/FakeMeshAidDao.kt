package dev.meshaid.app.data.local.dao

import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.data.local.entity.SeenPacketEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update

/**
 * In-memory fake of [MeshAidDao] for use in JVM unit tests.
 *
 * Mirrors the SQL semantics of each query:
 * - INSERT IGNORE → silently skips duplicate PKs.
 * - Priority queue → sorted by `(priority ASC, createdAt DESC)`.
 * - TTL filter → excludes rows where `ttl <= currentTimestampSeconds`.
 * - PENDING filter → excludes RELAYED / EXPIRED rows.
 * - evictLowPriorityPackets → deletes rows sorted by `(priority DESC, createdAt ASC)`.
 *
 * All state is held in [MutableStateFlow] collections so that [observePendingQueue]
 * and [observePendingCount] emit correct reactive updates during tests.
 */
class FakeMeshAidDao : MeshAidDao {

    // ─── Internal state ───────────────────────────────────────────────────────

    private val messages = MutableStateFlow<Map<String, MeshAidMessageEntity>>(emptyMap())
    private val seen = MutableStateFlow<Map<String, SeenPacketEntity>>(emptyMap())

    // ─── Insert ───────────────────────────────────────────────────────────────

    override suspend fun insertMessage(entity: MeshAidMessageEntity): Long {
        var inserted = false
        messages.update { current ->
            if (current.containsKey(entity.messageId)) {
                current // IGNORE conflict
            } else {
                inserted = true
                current + (entity.messageId to entity)
            }
        }
        return if (inserted) 1L else -1L
    }

    override suspend fun insertSeen(entity: SeenPacketEntity) {
        seen.update { current ->
            if (current.containsKey(entity.messageId)) current
            else current + (entity.messageId to entity)
        }
    }

    // ─── Deduplication ───────────────────────────────────────────────────────

    override suspend fun hasSeen(messageId: String): Boolean =
        seen.value.containsKey(messageId)

    // ─── Queue Reads ──────────────────────────────────────────────────────────

    override fun observePendingQueue(currentTimestampSeconds: Long): Flow<List<MeshAidMessageEntity>> =
        messages.map { map -> pendingQueueSnapshot(map, currentTimestampSeconds) }

    override suspend fun getPendingQueue(
        currentTimestampSeconds: Long,
        limit: Int
    ): List<MeshAidMessageEntity> =
        pendingQueueSnapshot(messages.value, currentTimestampSeconds).take(limit)

    private fun pendingQueueSnapshot(
        map: Map<String, MeshAidMessageEntity>,
        nowSeconds: Long
    ): List<MeshAidMessageEntity> =
        map.values
            .filter { it.relayStatus == MeshAidMessageEntity.RelayStatus.PENDING }
            .filter { it.ttl > nowSeconds }
            .sortedWith(compareBy<MeshAidMessageEntity> { it.priority }.thenByDescending { it.createdAt })

    // ─── Status Update ────────────────────────────────────────────────────────

    override suspend fun updateRelayStatus(messageId: String, status: String) {
        messages.update { current ->
            val entity = current[messageId] ?: return@update current
            current + (messageId to entity.copy(relayStatus = status))
        }
    }

    // ─── Expiry Pruning ───────────────────────────────────────────────────────

    override suspend fun deleteExpiredMessages(currentTimestampSeconds: Long): Int {
        var count = 0
        messages.update { current ->
            val (expired, valid) = current.values.partition { it.ttl <= currentTimestampSeconds }
            count = expired.size
            valid.associateBy { it.messageId }
        }
        return count
    }

    override suspend fun pruneOldSeenPackets(cutoffTimestampMs: Long): Int {
        var count = 0
        seen.update { current ->
            val (old, fresh) = current.values.partition { it.firstSeenTimestamp < cutoffTimestampMs }
            count = old.size
            fresh.associateBy { it.messageId }
        }
        return count
    }

    // ─── Overflow Eviction ────────────────────────────────────────────────────

    override suspend fun pendingCount(): Int =
        messages.value.values.count { it.relayStatus == MeshAidMessageEntity.RelayStatus.PENDING }

    override suspend fun evictLowPriorityPackets(dropCount: Int): Int {
        var evicted = 0
        messages.update { current ->
            val toEvict = current.values
                .filter { it.relayStatus == MeshAidMessageEntity.RelayStatus.PENDING }
                .sortedWith(compareByDescending<MeshAidMessageEntity> { it.priority }.thenBy { it.createdAt })
                .take(dropCount)
                .map { it.messageId }
                .toSet()
            evicted = toEvict.size
            current.filterKeys { it !in toEvict }
        }
        return evicted
    }

    // enforceQueueCap is a @Transaction default method — delegates to the two overrides above.

    // ─── Observable Count ─────────────────────────────────────────────────────

    override fun observePendingCount(): Flow<Int> =
        messages.map { map ->
            map.values.count { it.relayStatus == MeshAidMessageEntity.RelayStatus.PENDING }
        }
}
