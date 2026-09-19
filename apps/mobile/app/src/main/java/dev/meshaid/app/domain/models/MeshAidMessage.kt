package dev.meshaid.app.domain.models

/**
 * Core MeshAid Message Envelope Model for Android Node
 */
data class MeshAidMessage(
    val version: Int = 1,
    val id: String,
    val senderId: String,
    val recipientId: String = "BROADCAST",
    val timestamp: Long,
    val ttl: Long,
    val priority: Priority,
    val hopCount: Int = 0,
    val maxHops: Int = 7,
    val type: PayloadType,
    val payloadJson: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val signature: String? = null,
    val checksum: String
) {
    fun isExpired(nowMs: Long = System.currentTimeMillis()): Boolean {
        return nowMs >= (timestamp + (ttl * 1000L))
    }
}

enum class Priority(val tier: Int) {
    EMERGENCY_AUTHORITY(0),
    CIVILIAN_SOS(1),
    RESOURCE_LOGISTICS(2),
    GENERAL_INFO(3)
}

enum class PayloadType {
    SOS,
    BULLETIN,
    RESOURCE_REQ,
    RESOURCE_OFFER,
    ACK
}
