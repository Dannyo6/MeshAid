package dev.meshaid.app.ble

import dev.meshaid.app.protocol.MeshAidPacket
import dev.meshaid.app.protocol.MeshAidPacketCodec
import dev.meshaid.app.domain.models.Priority
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

class BleChunkingTest {

    @Test
    fun testPartitionAndReassembleLegacyChunks() {
        val payload = "Critical SOS alert: stranded on 2nd floor, immediate rescue needed".toByteArray(Charsets.UTF_8)
        val originalPacket = MeshAidPacket(
            version = 1,
            priority = Priority.CIVILIAN_SOS,
            hopCount = 2,
            messageId = byteArrayOf(0x12, 0x34, 0x56, 0x78, 0x9A.toByte(), 0xBC.toByte(), 0xDE.toByte(), 0xF0.toByte()),
            timestampSeconds = 1716000000L,
            ttlSeconds = 172800L,
            latitude = 37.7749f,
            longitude = -122.4194f,
            payload = payload
        )

        val wireBytes = MeshAidPacketCodec.encodePacket(originalPacket)
        assertEquals(MeshAidPacketCodec.HEADER_SIZE + payload.size, wireBytes.size)

        // Partition into legacy advertising chunks
        val correlationId = byteArrayOf(originalPacket.messageId[0], originalPacket.messageId[1])
        val totalExpectedChunks = (wireBytes.size + BleConstants.LEGACY_CHUNK_DATA_SIZE - 1) / BleConstants.LEGACY_CHUNK_DATA_SIZE

        // Test chunk partitioning logic
        val chunks = mutableListOf<ByteArray>()
        for (i in 0 until totalExpectedChunks) {
            val start = i * BleConstants.LEGACY_CHUNK_DATA_SIZE
            val end = (start + BleConstants.LEGACY_CHUNK_DATA_SIZE).coerceAtMost(wireBytes.size)
            val chunkPayload = wireBytes.copyOfRange(start, end)

            val chunkBuffer = ByteBuffer.allocate(BleConstants.LEGACY_CHUNK_HEADER_SIZE + chunkPayload.size)
            chunkBuffer.put(totalExpectedChunks.toByte())
            chunkBuffer.put(i.toByte())
            chunkBuffer.put(correlationId[0])
            chunkBuffer.put(correlationId[1])
            chunkBuffer.put(chunkPayload)
            chunks.add(chunkBuffer.array())
        }

        assertEquals(totalExpectedChunks, chunks.size)

        // Simulate receiver reassembly
        val reassembledStream = ByteArrayOutputStream()
        for (chunk in chunks) {
            val buf = ByteBuffer.wrap(chunk)
            val total = buf.get().toInt() and 0xFF
            val index = buf.get().toInt() and 0xFF
            val corr0 = buf.get()
            val corr1 = buf.get()

            assertEquals(totalExpectedChunks, total)
            assertEquals(chunks.indexOf(chunk), index)
            assertEquals(correlationId[0], corr0)
            assertEquals(correlationId[1], corr1)

            val chunkData = ByteArray(buf.remaining())
            buf.get(chunkData)
            reassembledStream.write(chunkData)
        }

        val reassembledBytes = reassembledStream.toByteArray()
        assertArrayEquals(wireBytes, reassembledBytes)

        // Decode reassembled packet
        val decodedPacket = MeshAidPacketCodec.decodePacket(reassembledBytes)
        assertEquals(originalPacket.version, decodedPacket.version)
        assertEquals(originalPacket.priority, decodedPacket.priority)
        assertEquals(originalPacket.hopCount, decodedPacket.hopCount)
        assertArrayEquals(originalPacket.messageId, decodedPacket.messageId)
        assertArrayEquals(originalPacket.payload, decodedPacket.payload)
    }
}
