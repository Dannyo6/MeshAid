# MeshAid Message & Wire Protocol Specification (v0.1-Draft)

## 1. Protocol Philosophy
The MeshAid Message Protocol is engineered for:
1. **Extreme Compactness**: Low overhead to minimize BLE transmission windows and energy consumption.
2. **Deterministic Serialization**: Identical message objects produce identical byte streams, essential for cryptographic signature verification.
3. **DTN Bounded Lifetimes**: Every bundle carries strict temporal and topological bounds (`ttl`, `max_hops`).

---

## 2. Canonical Message Envelope (Data Structure)

A MeshAid bundle is represented conceptually by the following schema:

```json
{
  "version": 1,
  "id": "a82f19d4e5b2c701",
  "sender_id": "node_7e41a9c8",
  "recipient_id": "BROADCAST",
  "timestamp": 1726671600000,
  "ttl": 172800,
  "priority": 1,
  "hop_count": 0,
  "max_hops": 7,
  "type": "SOS",
  "payload": {
    "category": "MEDICAL",
    "details": "Trapped under collapsed beam, 2 persons conscious",
    "injured_count": 2
  },
  "location": {
    "lat": 12.90812,
    "lng": 77.51845,
    "accuracy_m": 8.5
  },
  "signature": "3045022100e4a1b...",
  "checksum": "d2f8a91c..."
}
```

---

## 3. Field Specifications

| Field Name | Type | Size / Range | Description |
| :--- | :--- | :--- | :--- |
| `version` | Integer | 1 byte (0–255) | Protocol schema version (Current: `1`). |
| `id` | String / Bytes | 8–16 bytes (Hex) | Deterministic unique bundle ID: `SHA-256(sender_id + timestamp + nonce)[0..15]`. |
| `sender_id` | String | 8 bytes (Hex) | Ephemeral or persistent public key fingerprint of originating device. |
| `recipient_id`| String | Variable | Target address: `"BROADCAST"` for public alerts/SOS, or a specific Node ID for unicast. |
| `timestamp` | Int64 | 8 bytes (Unix ms) | Creation time in UTC milliseconds. |
| `ttl` | UInt32 | 4 bytes (Seconds) | Maximum duration bundle remains valid from creation. Default: `86400` (24h) to `172800` (48h). |
| `priority` | UInt8 | 1 byte (`0`–`3`) | Priority queue tier (see Section 4). |
| `hop_count` | UInt8 | 1 byte (`0`–`255`)| Number of intermediate relays traversed. Incremented by each relay node. |
| `max_hops` | UInt8 | 1 byte (`1`–`15`) | Maximum allowed hops. Relays drop bundles when `hop_count >= max_hops`. |
| `type` | String/Enum | 1 byte | Bundle category: `SOS` (1), `BULLETIN` (2), `RESOURCE_REQ` (3), `RESOURCE_OFFER` (4), `ACK` (5). |
| `payload` | Object/Binary| $\le 1024$ bytes | Application-specific emergency data. |
| `location` | Object (opt) | 12 bytes | Latitude (float32), Longitude (float32), and GPS horizontal accuracy (float32). |
| `signature` | String (Hex) | 64 bytes | Ed25519 cryptographic signature over canonical envelope fields. |
| `checksum` | String (Hex) | 4 bytes (CRC32/SHA) | Rapid transmission integrity check. |

---

## 4. Priority Tiers

MeshAid implements strict priority queuing. During short encounter windows, available channel capacity is allocated strictly in priority order:

| Level | Identifier | Semantics | Maximum Hops | Default TTL |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | `EMERGENCY_AUTHORITY` | Official evacuation orders, dam releases, tsunami alerts. | 12 | 72 hours |
| **P1** | `CIVILIAN_SOS` | Life-threatening distress, medical emergencies, trapped victims. | 7 | 48 hours |
| **P2** | `RESOURCE_LOGISTICS`| Clean water requests, blood supplies, fuel supplies, shelter availability. | 4 | 24 hours |
| **P3** | `GENERAL_INFO` | Welfare checks, road status observations, family check-in notices. | 2 | 12 hours |

---

## 5. BLE Encounter Handshake Protocol

When a GATT connection is established between discovering peers (Node A and Node B), the exchange proceeds across the dedicated **MeshAid GATT Characteristic** (`UUID: a82f1900-1111-2222-3333-444455556666`):

```
Node A (Central / Scanner)                           Node B (Peripheral / Server)
      |                                                           |
      | 1. HELLO [ProtocolVer: 1, NodeID: 0x7E41, StorageFree: 40MB]
      |---------------------------------------------------------->|
      | 2. HELLO_ACK [NodeID: 0x9B12, StorageFree: 85MB]          |
      |<----------------------------------------------------------|
      |                                                           |
      | 3. MANIFEST_OFFER [IDs: {A82F: P1}, {B912: P2}]           |
      |---------------------------------------------------------->|
      |    (Node B consults local deduplication set)              |
      | 4. MANIFEST_REQUEST [Want: {A82F}]                        |
      |<----------------------------------------------------------|
      |                                                           |
      | 5. BUNDLE_TRANSFER [Header + Chunk 1/2 + Chunk 2/2]       |
      |---------------------------------------------------------->|
      | 6. BUNDLE_ACK [ID: A82F, Status: STORED]                  |
      |<----------------------------------------------------------|
      |                                                           |
      | 7. DISCONNECT_GRACEFUL                                    |
```

### Chunking & MTU Framing:
If a bundle payload exceeds the negotiated ATT MTU (e.g. 512 bytes), the bundle is sliced into indexed wire chunks:
- `Chunk Header (5 bytes)`: `BundleID (2 bytes) | TotalChunks (1 byte) | ChunkIndex (1 byte) | Flags (1 byte)`
- `Chunk Payload`: Up to `(MTU - 8)` bytes.
The receiver reconstructs the full envelope in memory, verifies the SHA-256 checksum, and writes the assembled record to persistent storage.
