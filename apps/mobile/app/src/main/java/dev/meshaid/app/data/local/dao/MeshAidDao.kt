package dev.meshaid.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity.RelayStatus
import dev.meshaid.app.data.local.entity.SeenPacketEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data-access object for the MeshAid persistence layer.
 *
 * All queries are suspend or Flow-based so callers run them on the IO dispatcher
 * via Room's built-in coroutine integration.
 *
 * ### Priority Queue Contract
 * The outbound relay queue is ordered `priority ASC, created_at DESC`.
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
     * Returns all non-expired PENDING packets ordered by (priority ASC, createdAt DESC).
     *
     * TTL is compared against [currentTimestampSeconds] (Unix epoch seconds) so that
     * callers can easily pass `System.currentTimeMillis() / 1000`.
     *
     * Backed by the composite index on `(priority, created_at)`.
     */
    @Query(
        """
        SELECT * FROM mesh_messages
        WHERE relay_status = 'PENDING'
          AND ttl > :currentTimestampSeconds
        ORDER BY priority ASC, created_at DESC
        """
    )
    fun observePendingQueue(currentTimestampSeconds: Long): Flow<List<MeshAidMessageEntity>>

    /**
     * One-shot snapshot of the pending queue (useful in the cyclic advertise loop).
     */
    @Query(
        """
        SELECT * FROM mesh_messages
        WHERE relay_status = 'PENDING'
          AND ttl > :currentTimestampSeconds
        ORDER BY priority ASC, created_at DESC
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
    @Query("SELECT COUNT(*) > 0 FROM seen_packets WHERE message_id = :messageId")
    suspend fun hasSeen(messageId: String): Boolean

    // ─── Status Updates ───────────────────────────────────────────────────────

    /**
     * Marks a packet as [RelayStatus.RELAYED] after it has been successfully broadcast.
     */
    @Query(
        "UPDATE mesh_messages SET relay_status = :status WHERE message_id = :messageId"
    )
    suspend fun updateRelayStatus(messageId: String, status: String)

    // ─── Expiry Pruning ───────────────────────────────────────────────────────

    /**
     * Deletes all packets whose TTL has elapsed.
     * Should be called periodically (e.g. at the start of each advertising cycle).
     *
     * @return Number of rows deleted.
     */
    @Query(
        "DELETE FROM mesh_messages WHERE ttl <= :currentTimestampSeconds"
    )
    suspend fun deleteExpiredMessages(currentTimestampSeconds: Long): Int

    /**
     * Prunes stale seen-packet records older than [cutoffTimestampMs] (Unix millis).
     * Keeps the seen-cache table compact.
     *
     * @return Number of rows deleted.
     */
    @Query(
        "DELETE FROM seen_packets WHERE first_seen_timestamp < :cutoffTimestampMs"
    )
    suspend fun pruneOldSeenPackets(cutoffTimestampMs: Long): Int

    // ─── Overflow Eviction ────────────────────────────────────────────────────

    /**
     * Returns the total number of PENDING rows (used to decide if eviction is needed).
     */
    @Query("SELECT COUNT(*) FROM mesh_messages WHERE relay_status = 'PENDING'")
    suspend fun pendingCount(): Int

    /**
     * Evicts the lowest-priority (P3 → P2) packets when [pendingCount] > [threshold].
     *
     * The subquery selects the [dropCount] rows with the highest priority tier (least urgent)
     * and oldest creation time, then deletes them — effectively shedding load from the back
     * of the priority queue.
     *
     * @param threshold  Maximum number of PENDING rows to retain after eviction.
     * @param dropCount  Number of rows to delete in this sweep.
     */
    @Query(
        """
        DELETE FROM mesh_messages
        WHERE message_id IN (
            SELECT message_id FROM mesh_messages
            WHERE relay_status = 'PENDING'
            ORDER BY priority DESC, created_at ASC
            LIMIT :dropCount
        )
        """
    )
    suspend fun evictLowPriorityPackets(dropCount: Int): Int

    /**
     * Atomic helper: check overflow and evict in a single DB transaction.
     *
     * @param maxQueueSize  Target maximum PENDING row count after this call.
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
     * Live count of PENDING queue rows (useful for UI badges / debug overlays).
     */
    @Query("SELECT COUNT(*) FROM mesh_messages WHERE relay_status = 'PENDING'")
    fun observePendingCount(): Flow<Int>
}
