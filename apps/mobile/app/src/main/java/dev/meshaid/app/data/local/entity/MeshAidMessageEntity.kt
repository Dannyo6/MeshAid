package dev.meshaid.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Persists a raw MeshAid packet for store-and-forward relay.
 */
@Entity(
    tableName = "mesh_messages",
    indices = [
        Index(value = ["priority", "createdAt"]),
        Index(value = ["ttl"]),
        Index(value = ["isRelayed"])
    ]
)
data class MeshAidMessageEntity(
    @PrimaryKey
    val messageId: String,
    val priority: Int,
    val hopCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val ttl: Long,
    val latitude: Float = Float.NaN,
    val longitude: Float = Float.NaN,
    @ColumnInfo(typeAffinity = ColumnInfo.BLOB)
    val rawPacket: ByteArray,
    val isRelayed: Boolean = false
) {
    /** Alias property for raw wire bytes */
    val wireBytes: ByteArray
        get() = rawPacket

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MeshAidMessageEntity) return false

        if (messageId != other.messageId) return false
        if (priority != other.priority) return false
        if (hopCount != other.hopCount) return false
        if (createdAt != other.createdAt) return false
        if (ttl != other.ttl) return false
        if (latitude != other.latitude) return false
        if (longitude != other.longitude) return false
        if (!rawPacket.contentEquals(other.rawPacket)) return false
        if (isRelayed != other.isRelayed) return false

        return true
    }

    override fun hashCode(): Int {
        var result = messageId.hashCode()
        result = 31 * result + priority
        result = 31 * result + hopCount
        result = 31 * result + createdAt.hashCode()
        result = 31 * result + ttl.hashCode()
        result = 31 * result + latitude.hashCode()
        result = 31 * result + longitude.hashCode()
        result = 31 * result + rawPacket.contentHashCode()
        result = 31 * result + isRelayed.hashCode()
        return result
    }
}
