package dev.meshaid.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Persists a raw MeshAid wire-frame packet for store-and-forward relay.
 *
 * Priority is stored as an integer tier (0 = P0 critical … 3 = P3 low) so that
 * the DAO can issue an efficient `ORDER BY priority ASC, createdAt DESC` index scan
 * without any in-process re-sorting.
 *
 * [wireBytes] holds the complete encoded packet returned by [MeshAidPacketCodec.encodePacket],
 * allowing the relay service to hand the raw bytes straight to [BleAdvertiserManager] without
 * a second serialisation pass.
 */
@Entity(
    tableName = "mesh_messages",
    indices = [
        Index(value = ["priority", "created_at"]),   // composite index for priority queue scans
        Index(value = ["ttl"]),                       // index for TTL expiry sweeps
        Index(value = ["relay_status"])               // fast filter for pending-only reads
    ]
)
data class MeshAidMessageEntity(

    /** Hex-encoded SHA-256 message identifier – also the deduplication key. */
    @PrimaryKey
    @ColumnInfo(name = "message_id")
    val messageId: String,

    /** Complete encoded wire bytes, ready for BLE advertisement. */
    @ColumnInfo(name = "wire_bytes", typeAffinity = androidx.room.ColumnInfo.BLOB)
    val wireBytes: ByteArray,

    /**
     * Priority tier: 0 (P0 Critical) → 3 (P3 Low).
     * Lower values sort first so `ORDER BY priority ASC` yields the most urgent packets.
     */
    @ColumnInfo(name = "priority", index = false)
    val priority: Int,

    /**
     * Absolute Unix timestamp (seconds) after which this packet is expired and must
     * be pruned. Sourced from the decoded packet header TTL field.
     */
    @ColumnInfo(name = "ttl")
    val ttl: Long,

    /** Unix millis at insertion time, used as a tiebreaker within a priority bucket. */
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),

    /**
     * Relay lifecycle state:
     *  - `"PENDING"`   – awaiting cyclic advertisement
     *  - `"RELAYED"`   – successfully broadcast at least once
     *  - `"EXPIRED"`   – ttl passed; retained briefly for deduplication
     */
    @ColumnInfo(name = "relay_status")
    val relayStatus: String = RelayStatus.PENDING
) {
    // ByteArray equality must be structural – override required by data class contract
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MeshAidMessageEntity) return false
        return messageId == other.messageId && wireBytes.contentEquals(other.wireBytes)
    }

    override fun hashCode(): Int = 31 * messageId.hashCode() + wireBytes.contentHashCode()

    object RelayStatus {
        const val PENDING = "PENDING"
        const val RELAYED = "RELAYED"
        const val EXPIRED = "EXPIRED"
    }
}
