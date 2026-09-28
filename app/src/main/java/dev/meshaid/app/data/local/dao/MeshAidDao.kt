package dev.meshaid.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.data.local.entity.SeenPacketEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data-access object for the MeshAid persistence layer.
 *
 * All queries are suspend or Flow-based so callers run them on the IO dispatcher
 * via Room's built-in coroutine integration.
 *
 * ### Priority Queue Contract
 * The outbound relay queue is ordered `priority ASC, createdAt DESC`.
 * With priority stored as tier integer (0 = P0 Critical, 3 = P3 Low), `ASC` ordering
 * naturally surfaces the most urgent packets first.  Within the same priority bucket,
 * the most recently inserted packet is broadcast first (newest-first tiebreaker).
 */
@Dao
interface MeshAidDao {

    // ─── Message Insertion ────────────────────────────────────────────────────

    /**
     * Inserts a new relay packet.  [OnConflictStrategy.IGNORE] prevents duplicate
     * inserts when the same packet arrives from multiple BLE peers simultaneously.
     *
     * @return The SQLite row-id of the inserted row, or -1 if ignored.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertMessage(entity: MeshAidMessageEntity): Long

    // ─── Priority Queue Read ──────────────────────────────────────────────────

    /**
     * Returns all non-expired pending (not relayed) packets ordered by (priority ASC, createdAt DESC).
     */
    @Query(
        """
        SELECT * FROM mesh_messages
        WHERE isRelayed = 0
          AND ttl > :currentTimestampSeconds
        ORDER BY priority ASC, createdAt DESC
        """
    )
    fun observePendingQueue(currentTimestampSeconds: Long): Flow<List<MeshAidMessageEntity>>

    /**
     * One-shot snapshot of the pending queue (useful in the cyclic advertise loop).
     */
    @Query(
        """
        SELECT * FROM mesh_messages
        WHERE isRelayed = 0
          AND ttl > :currentTimestampSeconds
        ORDER BY priority ASC, createdAt DESC
        LIMIT :limit
        """
    )
    suspend fun getPendingQueue(
        currentTimestampSeconds: Long,
        limit: Int = 100
    ): List<MeshAidMessageEntity>

    // ─── Deduplication ───────────────────────────────────────────────────────

    /**
     * Inserts a seen-packet record.  IGNORE conflict ensures idempotent calls.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertSeen(entity: SeenPacketEntity)

    /**
     * Returns `true` if [messageId] has already been processed on this node.
     */
    @Query("SELECT COUNT(*) > 0 FROM seen_packets WHERE messageId = :messageId")
    suspend fun hasSeen(messageId: String): Boolean

    // ─── Status Updates ───────────────────────────────────────────────────────

    /**
     * Updates relay status after successful broadcast.
     */
    @Query(
        "UPDATE mesh_messages SET isRelayed = :isRelayed WHERE messageId = :messageId"
    )
    suspend fun updateRelayStatus(messageId: String, isRelayed: Boolean = true)

    // ─── Cloud Gateway Sync ───────────────────────────────────────────────────

    /**
     * Retrieves up to [limit] un-synced messages ordered by (priority ASC, createdAt DESC).
     */
    @Query("SELECT * FROM mesh_messages WHERE isSynced = 0 ORDER BY priority ASC, createdAt DESC LIMIT :limit")
    fun getUnsyncedMessages(limit: Int = 50): List<MeshAidMessageEntity>

    /**
     * Marks messages as synced to the edge-to-cloud gateway.
     */
    @Query("UPDATE mesh_messages SET isSynced = 1 WHERE messageId IN (:messageIds)")
    suspend fun markAsSynced(messageIds: List<String>)

    // ─── Expiry Pruning ───────────────────────────────────────────────────────

    /**
     * Deletes all packets whose TTL has elapsed.
     */
    @Query(
        "DELETE FROM mesh_messages WHERE ttl <= :currentTimestampSeconds"
    )
    suspend fun deleteExpiredMessages(currentTimestampSeconds: Long): Int

    /**
     * Prunes stale seen-packet records older than [cutoffTimestampMs] (Unix millis).
     */
    @Query(
        "DELETE FROM seen_packets WHERE firstSeenAt < :cutoffTimestampMs"
    )
    suspend fun pruneOldSeenPackets(cutoffTimestampMs: Long): Int

    // ─── Overflow Eviction ────────────────────────────────────────────────────

    /**
     * Returns the total number of pending rows.
     */
    @Query("SELECT COUNT(*) FROM mesh_messages WHERE isRelayed = 0")
    suspend fun pendingCount(): Int

    /**
     * Evicts the lowest-priority (P3 → P2) packets when [pendingCount] > [threshold].
     */
    @Query(
        """
        DELETE FROM mesh_messages
        WHERE messageId IN (
            SELECT messageId FROM mesh_messages
            WHERE isRelayed = 0
            ORDER BY priority DESC, createdAt ASC
            LIMIT :dropCount
        )
        """
    )
    suspend fun evictLowPriorityPackets(dropCount: Int): Int

    /**
     * Atomic helper: check overflow and evict in a single DB transaction.
     */
    @Transaction
    suspend fun enforceQueueCap(maxQueueSize: Int = 100) {
        val count = pendingCount()
        if (count > maxQueueSize) {
            val excess = count - maxQueueSize
            evictLowPriorityPackets(dropCount = excess)
        }
    }

    // ─── Observability ────────────────────────────────────────────────────────

    /**
     * Live count of pending queue rows.
     */
    @Query("SELECT COUNT(*) FROM mesh_messages WHERE isRelayed = 0")
    fun observePendingCount(): Flow<Int>

    /**
     * Live count of deduplication cache (seen packets).
     */
    @Query("SELECT COUNT(*) FROM seen_packets")
    fun observeSeenCount(): Flow<Int>

    /**
     * Live list of recent bulletins / messages ordered by creation time newest-first.
     */
    @Query("SELECT * FROM mesh_messages ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecentMessages(limit: Int = 50): Flow<List<MeshAidMessageEntity>>
}
