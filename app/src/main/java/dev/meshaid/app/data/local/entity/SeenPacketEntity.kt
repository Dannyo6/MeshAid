package dev.meshaid.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Lightweight duplicate-suppression record.
 */
@Entity(tableName = "seen_packets")
data class SeenPacketEntity(
    @PrimaryKey
    val messageId: String,
    val firstSeenAt: Long = System.currentTimeMillis()
) {
    /** Backward compatibility alias */
    val firstSeenTimestamp: Long
        get() = firstSeenAt

    companion object {
        const val SEEN_TTL_MS = 10 * 60 * 1000L
    }
}
