package dev.meshaid.app.ble

import android.os.ParcelUuid
import java.util.UUID

/**
 * BLE Transport Constants for MeshAid Protocol
 */
object BleConstants {
    // Dedicated 128-bit Service UUID for MeshAid mesh discovery
    val SERVICE_UUID: UUID = UUID.fromString("a82f0000-1111-2222-3333-444455556666")
    val PARCEL_SERVICE_UUID: ParcelUuid = ParcelUuid(SERVICE_UUID)

    // Dedicated GATT Characteristic UUID
    val CHARACTERISTIC_UUID: UUID = UUID.fromString("a82f1900-1111-2222-3333-444455556666")

    // Manufacturer ID for legacy fallback chunk broadcasts (0xFFFF = experimental/custom)
    const val MANUFACTURER_ID: Int = 0xFFFF

    // Legacy 31-byte advertising limits
    // After header/flags/overhead, manufacturer data payload is capped around 24 bytes
    const val LEGACY_CHUNK_HEADER_SIZE: Int = 4 // [totalChunks(1B), chunkIndex(1B), seq(2B)]
    const val LEGACY_CHUNK_DATA_SIZE: Int = 20
    const val EXTENDED_ADVERTISING_MAX_SIZE: Int = 254
}
