package dev.meshaid.app.protocol

import dev.meshaid.app.domain.models.MeshAidMessage
import dev.meshaid.app.domain.models.PayloadType
import dev.meshaid.app.domain.models.Priority
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/**
 * Binary Packet Representation for MeshAid BLE & Opportunistic Transport
 *
 * Wire format (Total Header: 96 bytes + N bytes payload):
 * - 00..01: Magic (2B: 0x4D, 0x41 / "MA")
 * - 02: Version (1B)
 * - 03: Priority Class (1B: P0-P3)
 * - 04..05: Hop Count (2B, Big Endian)
 * - 06..13: Message ID (8B SHA-256 slice)
 * - 14..17: Timestamp (4B UInt32 seconds, Big Endian)
 * - 18..21: TTL (4B UInt32 seconds, Big Endian)
 * - 22..25: Latitude (4B IEEE 754 Float, NaN if null)
 * - 26..29: Longitude (4B IEEE 754 Float, NaN if null)
 * - 30..31: Payload Length (2B UInt16, Big Endian)
 * - 32..95: Ed25519 Signature (64B)
 * - 96..End: Variable Payload (N bytes)
 */
data class MeshAidPacket(
    val version: Int = 1,
    val priority: Priority,
    val hopCount: Int = 0,
    val messageId: ByteArray, // 8 bytes
    val timestampSeconds: Long, // 4 bytes uint
    val ttlSeconds: Long, // 4 bytes uint
    val latitude: Float? = null,
    val longitude: Float? = null,
    val signature: ByteArray = ByteArray(64), // 64 bytes
    val payload: ByteArray
) {
    val messageIdHex: String
        get() = messageId.joinToString("") { "%02x".format(it) }

    val signatureHex: String
        get() = signature.joinToString("") { "%02x".format(it) }

    fun isExpired(nowSeconds: Long = System.currentTimeMillis() / 1000L): Boolean {
        return nowSeconds >= (timestampSeconds + ttlSeconds)
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as MeshAidPacket
        if (version != other.version) return false
        if (priority != other.priority) return false
        if (hopCount != other.hopCount) return false
        if (!messageId.contentEquals(other.messageId)) return false
        if (timestampSeconds != other.timestampSeconds) return false
        if (ttlSeconds != other.ttlSeconds) return false
        if (latitude != other.latitude) return false
        if (longitude != other.longitude) return false
        if (!signature.contentEquals(other.signature)) return false
        if (!payload.contentEquals(other.payload)) return false
        return true
    }

    override fun hashCode(): Int {
        var result = version
        result = 31 * result + priority.hashCode()
        result = 31 * result + hopCount
        result = 31 * result + messageId.contentHashCode()
        result = 31 * result + timestampSeconds.hashCode()
        result = 31 * result + ttlSeconds.hashCode()
        result = 31 * result + (latitude?.hashCode() ?: 0)
        result = 31 * result + (longitude?.hashCode() ?: 0)
        result = 31 * result + signature.contentHashCode()
        result = 31 * result + payload.contentHashCode()
        return result
    }
}

class ExpiredPacketException(message: String) : IllegalArgumentException(message)
class PacketIntegrityException(message: String) : SecurityException(message)

object MeshAidPacketCodec {

    const val FIXED_HEADER_SIZE = 96
    const val HEADER_SIZE = FIXED_HEADER_SIZE
    const val MAX_PAYLOAD_SIZE = 65535

    const val MAGIC_BYTE_0: Byte = 0x4D.toByte() // 'M'
    const val MAGIC_BYTE_1: Byte = 0x41.toByte() // 'A'

    // Standard ASN.1 prefix for 32-byte Ed25519 public keys to form X.509 DER
    private val ED25519_X509_PREFIX = byteArrayOf(
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
    )

    /**
     * Computes the 8-character hex SHA-256 slice for payload checksum integrity
     * matching @meshaid/protocol computePayloadChecksum
     */
    fun computeChecksum(payload: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(payload)
        return digest.take(4).joinToString("") { "%02x".format(it) }
    }

    /**
     * Serializes a MeshAidPacket into its canonical binary wire format (96B Header + Payload)
     */
    fun encodePacket(packet: MeshAidPacket): ByteArray {
        require(packet.messageId.size == 8) { "Message ID must be exactly 8 bytes" }
        require(packet.signature.size == 64) { "Signature must be exactly 64 bytes" }
        require(packet.payload.size <= MAX_PAYLOAD_SIZE) {
            "Payload size exceeds $MAX_PAYLOAD_SIZE bytes (got ${packet.payload.size})"
        }

        val buffer = ByteBuffer.allocate(FIXED_HEADER_SIZE + packet.payload.size).order(ByteOrder.BIG_ENDIAN)
        // 00..01: Magic (2B)
        buffer.put(MAGIC_BYTE_0)
        buffer.put(MAGIC_BYTE_1)
        // 02: Version (1B)
        buffer.put(packet.version.toByte())
        // 03: Priority (1B)
        buffer.put(packet.priority.tier.toByte())
        // 04..05: Hop Count (2B BE)
        buffer.putShort(packet.hopCount.toShort())
        // 06..13: Message ID (8B)
        buffer.put(packet.messageId)
        // 14..17: Timestamp (4B UInt32 BE)
        buffer.putInt((packet.timestampSeconds and 0xFFFFFFFFL).toInt())
        // 18..21: TTL (4B UInt32 BE)
        buffer.putInt((packet.ttlSeconds and 0xFFFFFFFFL).toInt())
        // 22..25: Lat (4B Float32 BE)
        buffer.putFloat(packet.latitude ?: Float.NaN)
        // 26..29: Lng (4B Float32 BE)
        buffer.putFloat(packet.longitude ?: Float.NaN)
        // 30..31: Payload Length (2B UInt16 BE)
        buffer.putShort((packet.payload.size and 0xFFFF).toShort())
        // 32..95: Ed25519 Signature (64B)
        buffer.put(packet.signature)
        // 96..End: Payload (variable bytes)
        buffer.put(packet.payload)

        return buffer.array()
    }

    /**
     * Encodes a domain MeshAidMessage into wire binary format
     */
    fun encodePacket(message: MeshAidMessage, signatureBytes: ByteArray? = null): ByteArray {
        val packet = messageToPacket(message, signatureBytes)
        return encodePacket(packet)
    }

    /**
     * Deserializes wire binary bytes into a MeshAidPacket and validates integrity
     */
    fun decodePacket(
        bytes: ByteArray,
        currentTimeSeconds: Long? = null,
        expectedChecksum: String? = null,
        publicKeyBytes: ByteArray? = null
    ): MeshAidPacket {
        if (bytes.size < FIXED_HEADER_SIZE) {
            throw PacketIntegrityException("Packet length ${bytes.size} is less than minimum header size ($FIXED_HEADER_SIZE)")
        }

        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)

        // 00..01: Magic (2B)
        val magic0 = buffer.get()
        val magic1 = buffer.get()
        if (magic0 != MAGIC_BYTE_0 || magic1 != MAGIC_BYTE_1) {
            throw PacketIntegrityException(
                "Invalid packet magic bytes: expected [0x4D, 0x41] ('MA'), got [0x%02X, 0x%02X]".format(magic0, magic1)
            )
        }

        // 02: Version (1B)
        val version = buffer.get().toInt() and 0xFF
        if (version != 1) {
            throw IllegalArgumentException("Unsupported protocol version: $version")
        }

        // 03: Priority (1B)
        val priorityTier = buffer.get().toInt() and 0xFF
        val priority = Priority.values().firstOrNull { it.tier == priorityTier }
            ?: throw IllegalArgumentException("Invalid priority tier: $priorityTier")

        // 04..05: Hop Count (2B BE)
        val hopCount = buffer.short.toInt() and 0xFFFF

        // 06..13: Message ID (8B)
        val messageId = ByteArray(8)
        buffer.get(messageId)

        // 14..17: Timestamp (4B UInt32 BE)
        val timestampSeconds = buffer.int.toLong() and 0xFFFFFFFFL

        // 18..21: TTL (4B UInt32 BE)
        val ttlSeconds = buffer.int.toLong() and 0xFFFFFFFFL

        // 22..25: Lat (4B Float32 BE)
        val rawLat = buffer.float
        val latitude = if (rawLat.isNaN()) null else rawLat

        // 26..29: Lng (4B Float32 BE)
        val rawLng = buffer.float
        val longitude = if (rawLng.isNaN()) null else rawLng

        // 30..31: Payload Length (2B UInt16 BE)
        val payloadLength = buffer.short.toInt() and 0xFFFF

        // 32..95: Ed25519 Signature (64B)
        val signature = ByteArray(64)
        buffer.get(signature)

        // 96..End: Payload (variable bytes)
        val remainingBytes = buffer.remaining()
        if (remainingBytes != payloadLength) {
            throw PacketIntegrityException(
                "Payload length mismatch: header declares $payloadLength bytes, but buffer contains $remainingBytes bytes"
            )
        }

        val payload = ByteArray(payloadLength)
        buffer.get(payload)

        val packet = MeshAidPacket(
            version = version,
            priority = priority,
            hopCount = hopCount,
            messageId = messageId,
            timestampSeconds = timestampSeconds,
            ttlSeconds = ttlSeconds,
            latitude = latitude,
            longitude = longitude,
            signature = signature,
            payload = payload
        )

        // Expiration check
        if (currentTimeSeconds != null && packet.isExpired(currentTimeSeconds)) {
            throw ExpiredPacketException("Packet TTL has expired (ts=$timestampSeconds, ttl=$ttlSeconds, now=$currentTimeSeconds)")
        }

        // Payload checksum validation
        if (expectedChecksum != null) {
            val actualChecksum = computeChecksum(packet.payload)
            if (!actualChecksum.equals(expectedChecksum, ignoreCase = true)) {
                throw PacketIntegrityException("Checksum mismatch: expected $expectedChecksum, got $actualChecksum")
            }
        }

        // Ed25519 signature tamper detection
        if (publicKeyBytes != null) {
            if (!verifySignature(packet, publicKeyBytes)) {
                throw PacketIntegrityException("Ed25519 signature verification failed: packet has been tampered with")
            }
        }

        return packet
    }

    /**
     * Collects all immutable packet fields into the byte array covered by Ed25519 signature
     * (32B Header 00..31 + N bytes payload)
     */
    fun getSignableBytes(packet: MeshAidPacket): ByteArray {
        val buffer = ByteBuffer.allocate(32 + packet.payload.size).order(ByteOrder.BIG_ENDIAN)
        buffer.put(MAGIC_BYTE_0)
        buffer.put(MAGIC_BYTE_1)
        buffer.put(packet.version.toByte())
        buffer.put(packet.priority.tier.toByte())
        buffer.putShort(packet.hopCount.toShort())
        buffer.put(packet.messageId)
        buffer.putInt((packet.timestampSeconds and 0xFFFFFFFFL).toInt())
        buffer.putInt((packet.ttlSeconds and 0xFFFFFFFFL).toInt())
        buffer.putFloat(packet.latitude ?: Float.NaN)
        buffer.putFloat(packet.longitude ?: Float.NaN)
        buffer.putShort((packet.payload.size and 0xFFFF).toShort())
        buffer.put(packet.payload)
        return buffer.array()
    }

    /**
     * Generates a new Ed25519 KeyPair
     */
    fun generateKeyPair(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("Ed25519")
        return kpg.generateKeyPair()
    }

    /**
     * Signs a packet using the private key and returns a new packet with the 64B signature attached
     */
    fun signPacket(packet: MeshAidPacket, privateKey: PrivateKey): MeshAidPacket {
        val signable = getSignableBytes(packet)
        val sig = Signature.getInstance("Ed25519")
        sig.initSign(privateKey)
        sig.update(signable)
        val signatureBytes = sig.sign()
        return packet.copy(signature = signatureBytes)
    }

    /**
     * Verifies the packet's Ed25519 signature against the given public key
     */
    fun verifySignature(packet: MeshAidPacket, publicKey: PublicKey): Boolean {
        return try {
            val signable = getSignableBytes(packet)
            val sig = Signature.getInstance("Ed25519")
            sig.initVerify(publicKey)
            sig.update(signable)
            sig.verify(packet.signature)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Verifies the packet's Ed25519 signature against raw 32B or X.509 encoded public key bytes
     */
    fun verifySignature(packet: MeshAidPacket, publicKeyBytes: ByteArray): Boolean {
        return try {
            val x509Bytes = if (publicKeyBytes.size == 32) {
                ED25519_X509_PREFIX + publicKeyBytes
            } else {
                publicKeyBytes
            }
            val keyFactory = KeyFactory.getInstance("Ed25519")
            val publicKey = keyFactory.generatePublic(X509EncodedKeySpec(x509Bytes))
            verifySignature(packet, publicKey)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Converts a domain MeshAidMessage to a wire MeshAidPacket
     */
    fun messageToPacket(message: MeshAidMessage, signatureBytes: ByteArray? = null): MeshAidPacket {
        val idBytes = parseOrDeriveIdBytes(message.id)
        val payloadBytes = message.payloadJson.toByteArray(Charsets.UTF_8)
        val sig = signatureBytes
            ?: message.signature?.let { hexToBytes(it) }
            ?: ByteArray(64)

        return MeshAidPacket(
            version = message.version,
            priority = message.priority,
            hopCount = message.hopCount,
            messageId = idBytes,
            timestampSeconds = message.timestamp / 1000L,
            ttlSeconds = message.ttl,
            latitude = message.latitude?.toFloat(),
            longitude = message.longitude?.toFloat(),
            signature = if (sig.size == 64) sig else ByteArray(64),
            payload = payloadBytes
        )
    }

    /**
     * Converts a wire MeshAidPacket back to a domain MeshAidMessage
     */
    fun packetToMessage(
        packet: MeshAidPacket,
        senderId: String = "NODE_${packet.messageIdHex.take(4)}",
        recipientId: String = "BROADCAST",
        type: PayloadType = PayloadType.SOS
    ): MeshAidMessage {
        val payloadJson = String(packet.payload, Charsets.UTF_8)
        val checksum = computeChecksum(packet.payload)

        return MeshAidMessage(
            version = packet.version,
            id = packet.messageIdHex,
            senderId = senderId,
            recipientId = recipientId,
            timestamp = packet.timestampSeconds * 1000L,
            ttl = packet.ttlSeconds,
            priority = packet.priority,
            hopCount = packet.hopCount,
            maxHops = 7,
            type = type,
            payloadJson = payloadJson,
            latitude = packet.latitude?.toDouble(),
            longitude = packet.longitude?.toDouble(),
            signature = packet.signatureHex,
            checksum = checksum
        )
    }

    private fun parseOrDeriveIdBytes(id: String): ByteArray {
        val hexClean = id.replace("-", "").lowercase()
        return if (hexClean.length >= 16) {
            hexToBytes(hexClean.substring(0, 16))
        } else {
            val digest = MessageDigest.getInstance("SHA-256").digest(id.toByteArray(Charsets.UTF_8))
            digest.take(8).toByteArray()
        }
    }

    fun hexToBytes(hex: String): ByteArray {
        val len = hex.length
        val result = ByteArray(len / 2)
        for (i in 0 until len step 2) {
            result[i / 2] = ((Character.digit(hex[i], 16) shl 4) +
                    Character.digit(hex[i + 1], 16)).toByte()
        }
        return result
    }
}
