package dev.meshaid.app.data

import android.util.Log
import dev.meshaid.app.data.local.dao.MeshAidDao
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.data.local.entity.SeenPacketEntity
import dev.meshaid.app.domain.models.Priority
import dev.meshaid.app.protocol.MeshAidPacket
import dev.meshaid.app.protocol.MeshAidPacketCodec
import kotlinx.coroutines.flow.Flow

/**
 * Single point of truth for all persistence operations in the MeshAid relay pipeline.
 *
 * ### Responsibilities
 * 1. **Ingestion**: Deserialise raw wire bytes, deduplicate via the seen-packet cache,
 *    persist the encoded packet, and enforce the queue size cap.
 * 2. **Deduplication**: A packet is only persisted if its [MeshAidPacket.messageIdHex]
 *    has never been observed before (checked atomically in [ingest]).
 * 3. **Queue access**: Provides a priority-ranked snapshot (`P0 → P3, newest-first`) for
 *    the relay service advertising loop.
 * 4. **Maintenance**: Expiry pruning, seen-cache sweeping, and low-priority eviction.
 *
 * @param dao  Injected DAO instance (injectable for testing).
 */
class MeshAidRepository(private val dao: MeshAidDao) {

    companion object {
        private const val TAG = "MeshAidRepository"

        /** Maximum number of PENDING rows to retain – older P3/P2 rows are evicted. */
        const val MAX_QUEUE_SIZE = 100
    }

    // ─── Ingestion ────────────────────────────────────────────────────────────

    /**
     * Ingests a received or locally-created packet into the persistent relay queue.
     *
     * Steps:
     * 1. Check the seen-packet cache ([hasSeen]). If already seen → return [IngestResult.DUPLICATE].
     * 2. Record the packet in the seen cache.
     * 3. Skip expired packets immediately.
     * 4. Encode the packet to wire bytes via [MeshAidPacketCodec].
     * 5. Persist the [MeshAidMessageEntity].
     * 6. Enforce the [MAX_QUEUE_SIZE] cap via [MeshAidDao.enforceQueueCap].
     *
     * @return [IngestResult] indicating whether the packet was accepted, was a duplicate, or was expired.
     */
    suspend fun ingest(packet: MeshAidPacket): IngestResult {
        val messageId = packet.messageIdHex

        // 1. Deduplication check
        if (dao.hasSeen(messageId)) {
            Log.d(TAG, "Duplicate suppressed: $messageId")
            return IngestResult.DUPLICATE
        }

        // 2. Record seen immediately (before persistence) to handle concurrent ingestion
        dao.insertSeen(SeenPacketEntity(messageId = messageId))

        // 3. Expiry guard
        val nowSeconds = System.currentTimeMillis() / 1000L
        val expiryTimestamp = if (packet.ttlSeconds < 1_000_000_000L) {
            packet.timestampSeconds + packet.ttlSeconds
        } else {
            packet.ttlSeconds
        }
        if (expiryTimestamp <= nowSeconds) {
            Log.w(TAG, "Ignoring already-expired packet: $messageId (expiry=$expiryTimestamp, now=$nowSeconds)")
            return IngestResult.EXPIRED
        }

        // 4. Encode to wire bytes
        val wireBytes = try {
            MeshAidPacketCodec.encodePacket(packet)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encode packet $messageId: ${e.message}")
            return IngestResult.ERROR
        }

        // 5. Persist
        val entity = MeshAidMessageEntity(
            messageId = messageId,
            priority = packet.priority.tier,
            hopCount = packet.hopCount,
            createdAt = System.currentTimeMillis(),
            ttl = expiryTimestamp,
            latitude = packet.latitude ?: Float.NaN,
            longitude = packet.longitude ?: Float.NaN,
            rawPacket = wireBytes,
            isRelayed = false
        )
        val rowId = dao.insertMessage(entity)
        if (rowId == -1L) {
            // IGNORE conflict – already in queue from a concurrent ingest
            Log.d(TAG, "Insert ignored (concurrent duplicate): $messageId")
            return IngestResult.DUPLICATE
        }

        // 6. Enforce cap
        dao.enforceQueueCap(MAX_QUEUE_SIZE)

        Log.i(TAG, "Ingested packet $messageId (priority=${packet.priority}, ttl=${packet.ttlSeconds})")
        return IngestResult.ACCEPTED
    }

    // ─── Queue Access ─────────────────────────────────────────────────────────

    /**
     * Returns a snapshot of the pending queue ordered by (priority ASC, createdAt DESC).
     * Excludes expired entries using the current wall-clock time.
     *
     * @param limit  Maximum number of packets to return (default [MAX_QUEUE_SIZE]).
     */
    suspend fun getPendingQueue(limit: Int = MAX_QUEUE_SIZE): List<MeshAidMessageEntity> {
        val nowSeconds = System.currentTimeMillis() / 1000L
        return dao.getPendingQueue(currentTimestampSeconds = nowSeconds, limit = limit)
    }

    /**
     * Live [Flow] of the pending queue for UI or monitoring purposes.
     */
    fun observePendingQueue(): Flow<List<MeshAidMessageEntity>> {
        val nowSeconds = System.currentTimeMillis() / 1000L
        return dao.observePendingQueue(nowSeconds)
    }

    /**
     * Live count of pending relay packets.
     */
    fun observePendingCount(): Flow<Int> = dao.observePendingCount()

    /**
     * Live count of deduplication cache (seen packets).
     */
    fun observeSeenCount(): Flow<Int> = dao.observeSeenCount()

    /**
     * Live list of recent bulletins / messages ordered by creation time newest-first.
     */
    fun observeRecentMessages(limit: Int = 50): Flow<List<MeshAidMessageEntity>> =
        dao.observeRecentMessages(limit)

    /**
     * Inserts an outbound emergency message created by the user node.
     *
     * Constructs a [MeshAidPacket] with the given priority, headcount, notes, and coordinates,
     * encodes it and persists it via [ingest].
     */
    suspend fun insertOutboundMessage(
        priority: Priority,
        notes: String,
        headcount: Int = 1,
        latitude: Float? = null,
        longitude: Float? = null,
        ttlSeconds: Long = 14400L
    ): IngestResult {
        val randomId = ByteArray(8).apply { java.security.SecureRandom().nextBytes(this) }
        val payloadTypeStr = when (priority) {
            Priority.CIVILIAN_SOS -> "SOS"
            Priority.RESOURCE_LOGISTICS -> "RESOURCE_REQ"
            Priority.GENERAL_INFO -> "BULLETIN"
            Priority.EMERGENCY_AUTHORITY -> "EMERGENCY"
        }
        val escapedNotes = notes.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
        val payloadJson = """{"type":"$payloadTypeStr","headcount":$headcount,"notes":"$escapedNotes"}"""
        val packet = MeshAidPacket(
            version = 1,
            priority = priority,
            hopCount = 0,
            messageId = randomId,
            timestampSeconds = System.currentTimeMillis() / 1000L,
            ttlSeconds = ttlSeconds,
            latitude = latitude,
            longitude = longitude,
            signature = ByteArray(64),
            payload = payloadJson.toByteArray(Charsets.UTF_8)
        )
        return ingest(packet)
    }

    /**
     * Overload: Inserts an outbound [MeshAidPacket] directly.
     */
    suspend fun insertOutboundMessage(packet: MeshAidPacket): IngestResult {
        return ingest(packet)
    }

    // ─── Status Updates ───────────────────────────────────────────────────────

    /**
     * Marks a message as relayed after a successful BLE broadcast.
     */
    suspend fun markRelayed(messageId: String) {
        dao.updateRelayStatus(messageId, isRelayed = true)
    }

    // ─── Maintenance ──────────────────────────────────────────────────────────

    /**
     * Performs a full maintenance sweep:
     * 1. Deletes expired message rows.
     * 2. Prunes stale seen-packet records older than [SeenPacketEntity.SEEN_TTL_MS].
     *
     * Should be called at the start of each advertising cycle (or on a periodic timer).
     */
    suspend fun runMaintenance() {
        val nowSeconds = System.currentTimeMillis() / 1000L
        val expiredDeleted = dao.deleteExpiredMessages(nowSeconds)
        val seenPruned = dao.pruneOldSeenPackets(System.currentTimeMillis() - SeenPacketEntity.SEEN_TTL_MS)
        Log.d(TAG, "Maintenance: expired=$expiredDeleted deleted, seen=$seenPruned pruned")
    }

    // ─── Result Types ─────────────────────────────────────────────────────────

    enum class IngestResult {
        /** Packet accepted and persisted to the relay queue. */
        ACCEPTED,
        /** Packet already seen — suppressed to prevent relay loops. */
        DUPLICATE,
        /** Packet TTL has already elapsed — not persisted. */
        EXPIRED,
        /** Encoding or DB error — packet not persisted. */
        ERROR
    }
}
