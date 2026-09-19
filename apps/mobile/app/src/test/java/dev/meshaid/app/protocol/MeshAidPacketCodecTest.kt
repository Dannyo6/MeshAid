package dev.meshaid.app.protocol

import dev.meshaid.app.domain.models.MeshAidMessage
import dev.meshaid.app.domain.models.PayloadType
import dev.meshaid.app.domain.models.Priority
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MeshAidPacketCodecTest {

    @Test
    fun testSerializationAndDeserializationRoundtrip() {
        val messageId = byteArrayOf(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08)
        val signature = ByteArray(64) { (it + 1).toByte() }
        val payload = "{\"sos\":\"trapped\",\"victims\":2}".toByteArray(Charsets.UTF_8)
        val timestamp = 1716000000L
        val ttl = 172800L
        val lat = 37.7749f
        val lng = -122.4194f

        val originalPacket = MeshAidPacket(
            version = 1,
            priority = Priority.CIVILIAN_SOS,
            hopCount = 3,
            messageId = messageId,
            timestampSeconds = timestamp,
            ttlSeconds = ttl,
            latitude = lat,
            longitude = lng,
            signature = signature,
            payload = payload
        )

        val encoded = MeshAidPacketCodec.encodePacket(originalPacket)
        assertEquals(MeshAidPacketCodec.HEADER_SIZE + payload.size, encoded.size)

        val decoded = MeshAidPacketCodec.decodePacket(encoded)
        assertEquals(originalPacket.version, decoded.version)
        assertEquals(originalPacket.priority, decoded.priority)
        assertEquals(originalPacket.hopCount, decoded.hopCount)
        assertArrayEquals(originalPacket.messageId, decoded.messageId)
        assertEquals(originalPacket.timestampSeconds, decoded.timestampSeconds)
        assertEquals(originalPacket.ttlSeconds, decoded.ttlSeconds)
        assertNotNull(decoded.latitude)
        assertEquals(lat, decoded.latitude!!, 0.0001f)
        assertNotNull(decoded.longitude)
        assertEquals(lng, decoded.longitude!!, 0.0001f)
        assertArrayEquals(originalPacket.signature, decoded.signature)
        assertArrayEquals(originalPacket.payload, decoded.payload)
    }

    @Test
    fun testNullableCoordinatesHandling() {
        val messageId = ByteArray(8) { 0xAA.toByte() }
        val payload = "{\"info\":\"power outage\"}".toByteArray(Charsets.UTF_8)

        val packetNoCoords = MeshAidPacket(
            version = 1,
            priority = Priority.GENERAL_INFO,
            hopCount = 0,
            messageId = messageId,
            timestampSeconds = 1700000000L,
            ttlSeconds = 86400L,
            latitude = null,
            longitude = null,
            payload = payload
        )

        val encoded = MeshAidPacketCodec.encodePacket(packetNoCoords)
        val decoded = MeshAidPacketCodec.decodePacket(encoded)

        assertNull(decoded.latitude)
        assertNull(decoded.longitude)
        assertEquals(Priority.GENERAL_INFO, decoded.priority)
    }

    @Test
    fun testDomainMessageRoundtrip() {
        val payloadJson = "{\"medical\":\"insulin required\"}"
        val checksum = MeshAidPacketCodec.computeChecksum(payloadJson.toByteArray(Charsets.UTF_8))
        val message = MeshAidMessage(
            version = 1,
            id = "a82f19d4e5b2c701",
            senderId = "CIVILIAN_123",
            recipientId = "BROADCAST",
            timestamp = 1716000000000L, // ms
            ttl = 86400L,
            priority = Priority.RESOURCE_LOGISTICS,
            hopCount = 1,
            maxHops = 4,
            type = PayloadType.RESOURCE_REQ,
            payloadJson = payloadJson,
            latitude = 12.9716,
            longitude = 77.5946,
            signature = null,
            checksum = checksum
        )

        val encoded = MeshAidPacketCodec.encodePacket(message)
        val decodedPacket = MeshAidPacketCodec.decodePacket(encoded)
        val decodedMessage = MeshAidPacketCodec.packetToMessage(
            decodedPacket,
            senderId = message.senderId,
            type = message.type
        )

        assertEquals(message.id, decodedMessage.id)
        assertEquals(message.priority, decodedMessage.priority)
        assertEquals(message.hopCount, decodedMessage.hopCount)
        assertEquals(message.payloadJson, decodedMessage.payloadJson)
        assertEquals(message.checksum, decodedMessage.checksum)
        assertEquals(message.latitude!!, decodedMessage.latitude!!, 0.001)
        assertEquals(message.longitude!!, decodedMessage.longitude!!, 0.001)
    }

    @Test(expected = PacketIntegrityException::class)
    fun testPayloadChecksumTamperDetection() {
        val payload = "{\"status\":\"ok\"}".toByteArray(Charsets.UTF_8)
        val expectedChecksum = MeshAidPacketCodec.computeChecksum(payload)

        val packet = MeshAidPacket(
            version = 1,
            priority = Priority.GENERAL_INFO,
            hopCount = 0,
            messageId = ByteArray(8) { 0x01 },
            timestampSeconds = 1716000000L,
            ttlSeconds = 3600L,
            payload = payload
        )

        val encoded = MeshAidPacketCodec.encodePacket(packet)

        // Tamper with payload byte in encoded array (last byte)
        encoded[encoded.size - 1] = (encoded[encoded.size - 1].toInt() xor 0xFF).toByte()

        // Should detect checksum mismatch and throw PacketIntegrityException
        MeshAidPacketCodec.decodePacket(encoded, expectedChecksum = expectedChecksum)
    }

    @Test
    fun testEd25519SignatureSigningAndTamperDetection() {
        val keyPair = MeshAidPacketCodec.generateKeyPair()
        val payload = "{\"alert\":\"Flash Flood Warning\"}".toByteArray(Charsets.UTF_8)

        val unsignedPacket = MeshAidPacket(
            version = 1,
            priority = Priority.EMERGENCY_AUTHORITY,
            hopCount = 0,
            messageId = ByteArray(8) { 0x42 },
            timestampSeconds = 1716000000L,
            ttlSeconds = 7200L,
            latitude = 25.0f,
            longitude = 80.0f,
            payload = payload
        )

        val signedPacket = MeshAidPacketCodec.signPacket(unsignedPacket, keyPair.private)
        val publicKeyBytes = keyPair.public.encoded

        // Valid signature should verify
        assertTrue(MeshAidPacketCodec.verifySignature(signedPacket, keyPair.public))
        assertTrue(MeshAidPacketCodec.verifySignature(signedPacket, publicKeyBytes))

        val encoded = MeshAidPacketCodec.encodePacket(signedPacket)
        val decoded = MeshAidPacketCodec.decodePacket(encoded, publicKeyBytes = publicKeyBytes)
        assertEquals(signedPacket.priority, decoded.priority)

        // Tamper with packet payload
        val tamperedBytes = encoded.clone()
        tamperedBytes[tamperedBytes.size - 1] = (tamperedBytes[tamperedBytes.size - 1].toInt() xor 0x01).toByte()

        var tamperedCaught = false
        try {
            MeshAidPacketCodec.decodePacket(tamperedBytes, publicKeyBytes = publicKeyBytes)
        } catch (e: PacketIntegrityException) {
            tamperedCaught = true
        }
        assertTrue("Tampered payload should be rejected by signature verification", tamperedCaught)

        // Tamper with signature directly
        val tamperedSigBytes = encoded.clone()
        // Signature starts at offset 29
        tamperedSigBytes[35] = (tamperedSigBytes[35].toInt() xor 0x55).toByte()

        var sigTamperCaught = false
        try {
            MeshAidPacketCodec.decodePacket(tamperedSigBytes, publicKeyBytes = publicKeyBytes)
        } catch (e: PacketIntegrityException) {
            sigTamperCaught = true
        }
        assertTrue("Tampered signature should be rejected", sigTamperCaught)
    }

    @Test
    fun testRejectionOfExpiredPacket() {
        val now = 1716100000L
        val expiredTimestamp = now - 5000L // created 5000 seconds ago
        val ttl = 3600L // valid for 3600 seconds -> expired 1400s ago

        val expiredPacket = MeshAidPacket(
            version = 1,
            priority = Priority.CIVILIAN_SOS,
            hopCount = 1,
            messageId = ByteArray(8) { 0x11 },
            timestampSeconds = expiredTimestamp,
            ttlSeconds = ttl,
            payload = "{\"emergency\":\"expired\"}".toByteArray(Charsets.UTF_8)
        )

        assertTrue(expiredPacket.isExpired(now))

        val encoded = MeshAidPacketCodec.encodePacket(expiredPacket)

        var caughtExpired = false
        try {
            MeshAidPacketCodec.decodePacket(encoded, currentTimeSeconds = now)
        } catch (e: ExpiredPacketException) {
            caughtExpired = true
        }
        assertTrue("Decoding expired packet must throw ExpiredPacketException", caughtExpired)

        // Non-expired should decode cleanly
        val validTimestamp = now - 1000L // created 1000s ago, ttl 3600s -> valid
        val validPacket = expiredPacket.copy(timestampSeconds = validTimestamp)
        assertFalse(validPacket.isExpired(now))
        val validEncoded = MeshAidPacketCodec.encodePacket(validPacket)
        val decoded = MeshAidPacketCodec.decodePacket(validEncoded, currentTimeSeconds = now)
        assertEquals(validPacket.timestampSeconds, decoded.timestampSeconds)
    }

    @Test(expected = PacketIntegrityException::class)
    fun testRejectTruncatedPacket() {
        val truncated = ByteArray(40) { 0x00 }
        MeshAidPacketCodec.decodePacket(truncated)
    }

    @Test(expected = PacketIntegrityException::class)
    fun testRejectPayloadLengthMismatch() {
        val packet = MeshAidPacket(
            version = 1,
            priority = Priority.CIVILIAN_SOS,
            hopCount = 0,
            messageId = ByteArray(8),
            timestampSeconds = 1000L,
            ttlSeconds = 1000L,
            payload = byteArrayOf(1, 2, 3)
        )
        val encoded = MeshAidPacketCodec.encodePacket(packet)
        // Alter payload length byte at offset 28
        encoded[28] = 10 // declares 10 bytes, but only 3 exist
        MeshAidPacketCodec.decodePacket(encoded)
    }
}
