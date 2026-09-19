package dev.meshaid.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Lightweight duplicate-suppression record.
 *
 * Every time a packet with a new [messageId] is first observed (either received
 * over BLE or locally originated), a [SeenPacketEntity] row is written.  The relay
 * engine checks this table before processing to prevent re-advertising packets that
 * have already completed their local relay cycle or arrived via multiple paths.
 *
 * Rows in this table are retained for [SEEN_TTL_MS] (default 10 minutes) and then
 * pruned by the scheduled eviction job, keeping the table compact.
 */
@Entity(tableName = "seen_packets")
data class SeenPacketEntity(

    /** Hex-encoded SHA-256 message identifier – matches [MeshAidMessageEntity.messageId]. */
    @PrimaryKey
    @ColumnInfo(name = "message_id")
    val messageId: String,

    /** Unix millis when this packet was first observed on this node. */
    @ColumnInfo(name = "first_seen_timestamp")
    val firstSeenTimestamp: Long = System.currentTimeMillis()
) {
    companion object {
        /** Rows older than this threshold are eligible for pruning (10 minutes). */
        const val SEEN_TTL_MS = 10 * 60 * 1000L
    }
}
