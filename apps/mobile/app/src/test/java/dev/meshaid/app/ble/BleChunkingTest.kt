package dev.meshaid.app.ble

import dev.meshaid.app.domain.models.Priority
import dev.meshaid.app.protocol.MeshAidPacket
import dev.meshaid.app.protocol.MeshAidPacketCodec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

class BleChunkingTest {

    private fun buildChunk(
        totalChunks: Int,
        chunkIndex: Int,
        corr0: Byte,
        corr1: Byte,
        chunkData: ByteArray
    ): ByteArray {
        val buf = ByteBuffer.allocate(BleConstants.LEGACY_CHUNK_HEADER_SIZE + chunkData.size)
        buf.put(totalChunks.toByte())
        buf.put(chunkIndex.toByte())
        buf.put(corr0)
        buf.put(corr1)
        buf.put(chunkData)
        return buf.array()
    }

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

    @Test
    fun testChunkAssemblySessionExpiration() {
        val scanner = BleScannerManager()
        var dispatchedPacket: MeshAidPacket? = null
        scanner.onPacketReceived = { dispatchedPacket = it }

        // Create a 2-chunk packet
        val payload = "Emergency SOS trapped".toByteArray(Charsets.UTF_8)
        val packet = MeshAidPacket(
            version = 1,
            priority = Priority.CIVILIAN_SOS,
            hopCount = 0,
            messageId = byteArrayOf(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08),
            timestampSeconds = 1716000000L,
            ttlSeconds = 3600L,
            payload = payload
        )
        val wireBytes = MeshAidPacketCodec.encodePacket(packet)
        val mid = wireBytes.size / 2
        val chunk0Data = wireBytes.copyOfRange(0, mid)
        val chunk1Data = wireBytes.copyOfRange(mid, wireBytes.size)

        val corr0 = 0x12.toByte()
        val corr1 = 0x34.toByte()
        val chunk0 = buildChunk(2, 0, corr0, corr1, chunk0Data)
        val chunk1 = buildChunk(2, 1, corr0, corr1, chunk1Data)

        val deviceAddress = "DEVICE_EXPIRE_TEST"
        val sessionKey = "$deviceAddress-$corr0-$corr1"

        // Ingest chunk 0 (session created)
        val chunk0Result = scanner.processLegacyChunk(deviceAddress, chunk0)
        assertFalse(chunk0Result)
        assertTrue(scanner.assemblyMap.containsKey(sessionKey))

        // Simulate 35 seconds elapsed (TTL is 30s)
        val session = scanner.assemblyMap[sessionKey]!!
        session.createdAt = System.currentTimeMillis() - 35_000L

        // Ingest chunk 1 (arriving late after 35 seconds)
        val chunk1Result = scanner.processLegacyChunk(deviceAddress, chunk1)

        // Session was pruned on arrival of chunk 1, so chunk 1 alone cannot complete the expired packet
        assertFalse(chunk1Result)
        assertNull(dispatchedPacket)
    }

    @Test
    fun testLruCapacityLimit() {
        val scanner = BleScannerManager()

        // Verify constant
        assertEquals(100, BleScannerManager.MAX_ASSEMBLY_SESSIONS)

        // Ingest 101 distinct incomplete message sessions via processLegacyChunk
        for (i in 0..100) {
            val corr0 = (i shr 8).toByte()
            val corr1 = (i and 0xFF).toByte()
            val chunk = buildChunk(2, 0, corr0, corr1, byteArrayOf(i.toByte()))
            scanner.processLegacyChunk("DEV_LRU", chunk)
        }

        // Cache must be capped at 100 entries
        assertEquals(100, scanner.assemblyMap.size)

        // Oldest entry (index 0: corr0=0, corr1=0) must have been evicted
        val oldestKey = "DEV_LRU-0-0"
        assertFalse("Oldest entry should be evicted by LRU capacity", scanner.assemblyMap.containsKey(oldestKey))

        // Newest entry (index 100: corr0=0, corr1=100) must be present
        val newestKey = "DEV_LRU-0-100"
        assertTrue("Newest entry should be present in LRU cache", scanner.assemblyMap.containsKey(newestKey))

        // Direct map verification: put 101 sessions directly into assemblyMap
        scanner.assemblyMap.clear()
        for (i in 0..100) {
            scanner.assemblyMap["session_$i"] = BleScannerManager.ChunkAssemblySession(totalChunks = 2)
        }
        assertEquals(100, scanner.assemblyMap.size)
        assertFalse(scanner.assemblyMap.containsKey("session_0"))
        assertTrue(scanner.assemblyMap.containsKey("session_100"))
    }

    @Test
    fun testMalformedChunkBoundsRejection() {
        val scanner = BleScannerManager()

        // 1. Oversized totalChunks (> 16): e.g. 17, 255
        val oversizedChunk17 = buildChunk(17, 0, 1, 1, byteArrayOf(1, 2))
        val res17 = scanner.processLegacyChunk("DEV_BAD", oversizedChunk17)
        assertFalse(res17)
        assertFalse(scanner.assemblyMap.containsKey("DEV_BAD-1-1"))

        val oversizedChunk255 = buildChunk(255, 0, 1, 2, byteArrayOf(1, 2))
        val res255 = scanner.processLegacyChunk("DEV_BAD", oversizedChunk255)
        assertFalse(res255)

        // 2. Zero totalChunks (0): invalid
        val zeroTotalChunk = buildChunk(0, 0, 1, 3, byteArrayOf(1, 2))
        val resZero = scanner.processLegacyChunk("DEV_BAD", zeroTotalChunk)
        assertFalse(resZero)

        // 3. Out-of-bounds chunkIndex (chunkIndex >= totalChunks): e.g. chunkIndex=2 when totalChunks=2
        val oobChunk = buildChunk(2, 2, 1, 4, byteArrayOf(1, 2))
        val resOob = scanner.processLegacyChunk("DEV_BAD", oobChunk)
        assertFalse(resOob)

        val oobChunkLarge = buildChunk(3, 10, 1, 5, byteArrayOf(1, 2))
        val resOobLarge = scanner.processLegacyChunk("DEV_BAD", oobChunkLarge)
        assertFalse(resOobLarge)

        // 4. ChunkAssemblySession direct bounds enforcement
        var caughtSession17 = false
        try {
            BleScannerManager.ChunkAssemblySession(totalChunks = 17)
        } catch (e: IllegalArgumentException) {
            caughtSession17 = true
        }
        assertTrue("ChunkAssemblySession(17) must throw IllegalArgumentException", caughtSession17)

        var caughtSession0 = false
        try {
            BleScannerManager.ChunkAssemblySession(totalChunks = 0)
        } catch (e: IllegalArgumentException) {
            caughtSession0 = true
        }
        assertTrue("ChunkAssemblySession(0) must throw IllegalArgumentException", caughtSession0)

        // 5. ChunkAssemblySession chunkIndex bounds enforcement
        val session = BleScannerManager.ChunkAssemblySession(totalChunks = 3)
        var caughtIndexOob = false
        try {
            session.addChunk(3, byteArrayOf(1))
        } catch (e: IllegalArgumentException) {
            caughtIndexOob = true
        }
        assertTrue("addChunk with index 3 for totalChunks 3 must throw IllegalArgumentException", caughtIndexOob)

        var caughtNegativeIndex = false
        try {
            session.addChunk(-1, byteArrayOf(1))
        } catch (e: IllegalArgumentException) {
            caughtNegativeIndex = true
        }
        assertTrue("addChunk with negative index must throw IllegalArgumentException", caughtNegativeIndex)

        // 6. Duplicate chunk payload overwrite prevention
        val firstAdd = session.addChunk(0, byteArrayOf(0xAA.toByte(), 0xBB.toByte()))
        assertTrue(firstAdd)
        val duplicateAdd = session.addChunk(0, byteArrayOf(0xFF.toByte(), 0xFF.toByte()))
        assertFalse(duplicateAdd)
        assertArrayEquals(byteArrayOf(0xAA.toByte(), 0xBB.toByte()), session.getChunk(0))
    }
}
