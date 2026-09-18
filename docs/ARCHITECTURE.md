# MeshAid System Architecture

## 1. High-Level Architecture Overview

The MeshAid architecture is partitioned into four primary functional tiers:
1. **Edge Mesh Nodes (Mobile Devices / Micro-relays)**: Offline physical nodes discovering peers, hosting local GATT servers/clients, and managing opportunistic message storage.
2. **Relay Engine & Protocol Layer**: The core deterministic state machine controlling message deduplication, TTL aging, priority queues, and bundle exchange handshakes.
3. **Gateway Nodes**: Intermittently or newly connected edge nodes with restored backhaul access that bridge queued bundles to centralized responders.
4. **Responder Hub (Backend & Emergency Dashboard)**: Ingestion server and geospatial monitoring interface for disaster response authorities.

```
                    +----------------------------------------+
                    |        MeshAid Mobile App (Node)       |
                    +----------------------------------------+
                                        |
                    +----------------------------------------+
                    |      MeshAid Protocol & Relay Core     |
                    +----------------------------------------+
                                        |
                  +---------------------+--------------------+
                  |                                          |
        +-------------------+                      +-------------------+
        |  BLE Transport    |                      | Wi-Fi Direct (P2P)|
        | (GATT Dual-Role)  |                      | (High Throughput) |
        +-------------------+                      +-------------------+
                  |                                          |
                  +---------------------+--------------------+
                                        |
                            [ Wireless Physical Medium ]
                                        |
                    +----------------------------------------+
                    |        Nearby Opportunistic Peer       |
                    +----------------------------------------+
                                        |
                    +----------------------------------------+
                    |        Local Store & Forward DB        |
                    |             (SQLite / Room)            |
                    +----------------------------------------+
                                        |
                  +---------------------+--------------------+
                  |                                          |
        +-------------------+                      +-------------------+
        | Offline Relay Node|                      |   Gateway Node    |
        | (Carry & Forward) |                      | (Internet Active) |
        +-------------------+                      +-------------------+
                                                             |
                                                     [ HTTPS / WSS ]
                                                             |
                                                   +-------------------+
                                                   |   MeshAid Cloud   |
                                                   |   Gateway Server  |
                                                   +-------------------+
                                                             |
                                                   +-------------------+
                                                   |    Web Incident   |
                                                   |     Dashboard     |
                                                   +-------------------+
```

---

## 2. Layered Protocol Model

MeshAid utilizes a lightweight, 4-tier communication stack inspired by the RFC 5050 / RFC 9171 Delay-Tolerant Networking Bundle Protocol:

| Layer | Responsibility | Primitives / Mechanisms |
| :--- | :--- | :--- |
| **Application Layer** | User intent, SOS generation, bulletins, resource requests/offers. | Form validation, GPS coordinate capture, urgency classification. |
| **DTN / Relay Engine** | Message lifecycle, priority scheduling, TTL bounding, storage, deduplication. | Bloom filters / hash sets, SQLite persistent spooler, priority FIFO queues. |
| **Encounter & Transfer** | Session negotiation, payload fragmentation, integrity verification. | Manifest exchange (`HAVE`/`WANT`), MTU chunking, SHA-256 / Ed25519. |
| **Radio / Link Layer** | Physical broadcast, peer discovery, GATT read/write, P2P sockets. | BLE Advertising/Scanning (Dual-Role), Wi-Fi Direct Group Owner/Client. |

---

## 3. Communication & Encounter Data Flow

When two MeshAid devices enter RF range, they follow a 4-step encounter handshake:

```
Device A (Holding Messages)                         Device B (Peer)
      |                                                   |
      | 1. BLE Broadcast (Service UUID + NodeID)          |
      |<=================================================>| [Mutual Discovery]
      |                                                   |
      | 2. Connect GATT / Open Channel                    |
      |-------------------------------------------------->|
      |                                                   |
      | 3. Handshake: Manifest Exchange                   |
      |    Device A sends list of Message IDs & Priorities|
      |-------------------------------------------------->|
      |    Device B checks local DB (Deduplication filter)|
      |    Device B responds with 'WANT' list             |
      |<--------------------------------------------------|
      |                                                   |
      | 4. Selective Payload Transfer                     |
      |    Device A streams only requested packets (P0->P3|
      |-------------------------------------------------->|
      |    Device B verifies SHA-256 integrity & stores   |
      |    Device B acknowledges receipt                  |
      |<--------------------------------------------------|
      |                                                   |
      | 5. Graceful Disconnect                            |
```

### Manifest Handshake Rationale:
- **Bandwidth Preservation**: Instead of blindly dumping full payloads over constrained BLE channels (which have high packet loss and 20–240 byte MTU realities), nodes only transmit a lightweight manifest (20-byte IDs + priorities).
- **Zero Redundant Relay**: If Device B has already received message `0xFA91...`, it omits it from its `WANT` response, preventing wasted airtime and battery depletion.

---

## 4. Relay & Lifecycle Flow

1. **Generation**: Node creates message $M$, assigns Unique ID = $\text{SHA-256}(\text{SenderID} + \text{Timestamp} + \text{Nonce})$, sets Priority ($P0$–$P3$), and Initial TTL (e.g., 48 hours).
2. **Local Caching**: $M$ is written to the local persistent store (SQLite) with status `STORED_AND_FORWARDING`.
3. **Carrying**: The device user walks, drives, or relocates. Background foreground service periodically triggers advertising and scanning windows.
4. **Forwarding Encounter**: Upon encountering Node $X$, $M$ is transmitted if $X$ does not have $M$ and TTL $> 0$.
5. **Aging & Eviction**:
   - Every 60 seconds, the relay engine checks local bundles.
   - If $\text{CurrentTime} - \text{Timestamp} > \text{TTL}$, the message status transitions to `EXPIRED` and is deleted from the active relay queue.
   - Memory-bounded FIFO: If storage exceeds 50 MB, lowest priority ($P3$), oldest packets are evicted first. $P0$ (authoritative alerts) and $P1$ (SOS) are locked against eviction.

---

## 5. Gateway Synchronization Flow

When any node with queued messages detects active cellular or Wi-Fi internet connectivity:
1. It queries the local database for all un-synced bundles (`synced_to_gateway = false`).
2. It establishes an authenticated TLS connection to the MeshAid Backend Server (`POST /api/v1/sync/ingest`).
3. It uploads the queued bundles in priority order ($P0 \to P1 \to P2 \to P3$).
4. The server validates signatures, records the messages in the central database, deduplicates against existing incident reports, and marks them `ACKNOWLEDGED`.
5. The web Incident Dashboard receives real-time updates via WebSockets for display to emergency response command centers.
