package dev.meshaid.app.net

import android.util.Log
import dev.meshaid.app.data.local.dao.MeshAidDao
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64

/**
 * Transport abstraction for making HTTP POST requests with JSON payloads.
 * Allows pure JVM testing without spinning up mock HTTP servers or requiring OkHttp.
 */
fun interface HttpTransport {
    /**
     * Sends an HTTP POST with [json] payload to [url].
     * @return HTTP status code (e.g. 200, 201), or -1 if connection fails.
     */
    fun postJson(url: String, json: String): Int
}

/**
 * Production [HttpTransport] implementation backed by [HttpURLConnection].
 */
class DefaultHttpTransport(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 10_000
) : HttpTransport {
    override fun postJson(url: String, json: String): Int {
        var connection: HttpURLConnection? = null
        return try {
            val endpointUrl = URL(url)
            connection = (endpointUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }
            connection.outputStream.use { os ->
                OutputStreamWriter(os, Charsets.UTF_8).use { writer ->
                    writer.write(json)
                    writer.flush()
                }
            }
            connection.responseCode
        } catch (e: Exception) {
            Log.e(TAG, "HTTP POST to $url failed: ${e.message}")
            -1
        } finally {
            connection?.disconnect()
        }
    }

    companion object {
        private const val TAG = "DefaultHttpTransport"
    }
}

/**
 * Edge-to-Cloud Gateway Sync Manager.
 *
 * Pulls un-synced emergency wire packets from the local Room database, encodes them as Base64,
 * and transmits them to the edge gateway API endpoint (`POST /api/mesh/sync`).
 * Upon successful ingestion (HTTP 200/201), packets are marked as synced (`isSynced = true`).
 *
 * @param dao Injected [MeshAidDao] for Room access.
 * @param gatewayBaseUrl Base URL of the edge gateway (e.g. `http://10.0.2.2:3000` for Android emulator).
 * @param httpTransport Injectable HTTP transport layer.
 */
class GatewaySyncManager(
    private val dao: MeshAidDao,
    val gatewayBaseUrl: String = DEFAULT_GATEWAY_URL,
    private val httpTransport: HttpTransport = DefaultHttpTransport()
) {

    companion object {
        const val DEFAULT_GATEWAY_URL = "http://10.0.2.2:3000"
        const val SYNC_BATCH_LIMIT = 50
        const val SYNC_ENDPOINT_PATH = "/api/mesh/sync"
        private const val TAG = "GatewaySyncManager"
    }

    /**
     * Formats a list of Base64 wire frames into the expected JSON structure:
     * `{"packets":["...","..."]}`
     */
    internal fun buildJsonPayload(base64Packets: List<String>): String {
        val arrayContent = base64Packets.joinToString(separator = ",") { "\"$it\"" }
        return "{\"packets\":[$arrayContent]}"
    }

    /**
     * Synchronizes pending un-synced messages to the edge gateway.
     *
     * Steps:
     * 1. Fetches up to [limit] un-synced entities from Room.
     * 2. Returns early (0) if there are no pending messages.
     * 3. Base64 encodes each entity's `rawPacket`.
     * 4. Transmits `{"packets": [...]}` to `/api/mesh/sync`.
     * 5. Upon receiving HTTP 200 or 201, marks the sent messages as synced via [MeshAidDao.markAsSynced].
     *
     * @param limit Maximum number of messages to sync in this batch (default 50).
     * @return Number of messages successfully uploaded and marked as synced, or 0 on failure/empty.
     */
    suspend fun syncPendingMessages(limit: Int = SYNC_BATCH_LIMIT): Int = withContext(Dispatchers.IO) {
        val unsynced = try {
            dao.getUnsyncedMessages(limit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query unsynced messages from DAO: ${e.message}")
            return@withContext 0
        }

        if (unsynced.isEmpty()) {
            Log.d(TAG, "No unsynced messages in queue")
            return@withContext 0
        }

        val base64Packets = unsynced.map { entity ->
            Base64.getEncoder().encodeToString(entity.rawPacket)
        }

        val payload = buildJsonPayload(base64Packets)
        val endpoint = "${gatewayBaseUrl.trimEnd('/')}$SYNC_ENDPOINT_PATH"

        Log.i(TAG, "Uploading ${unsynced.size} unsynced packet(s) to $endpoint")

        val statusCode = try {
            httpTransport.postJson(endpoint, payload)
        } catch (e: Exception) {
            Log.e(TAG, "Network exception during gateway sync: ${e.message}")
            -1
        }

        if (statusCode in 200..201) {
            val messageIds = unsynced.map { it.messageId }
            try {
                dao.markAsSynced(messageIds)
                Log.i(TAG, "Successfully synced ${messageIds.size} packet(s) (HTTP $statusCode)")
                messageIds.size
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update sync status in DAO: ${e.message}")
                0
            }
        } else {
            Log.w(TAG, "Gateway rejected sync request with HTTP status: $statusCode")
            0
        }
    }
}
