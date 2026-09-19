# MeshAid Minimum Viable Product (MVP) Specification

## 1. Product Objective
The primary objective of the MeshAid MVP is to execute and validate the **three-device opportunistic relay demonstration**:
$$\text{Phone A (Sender)} \longrightarrow \text{Phone B (Relay)} \longrightarrow \text{Phone C (Receiver)}$$
under conditions where Phone A and Phone C are isolated beyond direct radio range, without access to cellular towers, Wi-Fi infrastructure, or internet connectivity.

---

## 2. Feature Classification

### 2.1 Must-Have Features (Phase 1–3 Core MVP)
These features are strictly mandatory for the foundational release and technical demonstration:

1. **Ad-Hoc Peer Discovery via BLE**:
   - Continuous or duty-cycled BLE advertising containing the unique MeshAid Service UUID.
   - BLE scanning detecting nearby nodes and initiating contact.
2. **Dual-Role GATT Operation**:
   - Ability for a phone to host a GATT Server (accepting bundle transfers) while simultaneously functioning as a GATT Client (discovering peers and initiating outbound transfers).
3. **Offline SOS Creation**:
   - Simple, intuitive emergency distress button generating a standardized emergency bundle.
   - Captures urgency level, sender anonymous ID, timestamp, and optional GPS coordinates.
4. **Deterministic Unique Message Identification**:
   - Collision-resistant 64-bit or 128-bit truncated SHA-256 hash IDs derived from bundle attributes.
5. **Local Persistent Storage**:
   - SQLite / Room database spooler storing received, queued, and created messages with persistence across app restarts.
6. **Multi-Hop Relay Engine (Store-Carry-Forward)**:
   - Intermediate nodes automatically cache passing bundles and deliver them upon encountering a new peer.
7. **Strict Duplicate Suppression**:
   - In-memory Bloom filter and database index of observed message IDs (`SeenMessageIDs`).
   - Exchange of manifests prior to payload transfer to eliminate redundant transmissions.
8. **Priority Queuing**:
   - Four-tier strict priority scheduling:
     - `P0`: Emergency Authority Alerts
     - `P1`: Civilian Distress / Medical SOS
     - `P2`: Resource Supply Requests / Offers
     - `P3`: General Information Bulletins
   - High-priority bundles are dequeued and transmitted first during short BLE encounter windows.
9. **Time-To-Live (TTL) & Hop-Limit Expiry**:
   - Automated message expiration based on UTC timestamp + TTL duration.
   - Hop count incrementing at each relay; packets exceeding `MaxHops` are dropped from forwarding queues.

---

### 2.2 Should-Have Features (Phase 4 Intermediate MVP)
Features to be introduced once the core three-node physical relay is demonstrated:

1. **Emergency Bulletin Board**:
   - Broadcast channel for local safety announcements (e.g., "Bridge Collapse at Sector 4", "Shelter Open at Community Hall").
2. **Resource Sharing Ledger**:
   - Structured format for registering supply surpluses (e.g., clean water, generators) and critical shortages (e.g., blood group O+, insulin).
3. **Gateway Synchronization**:
   - Automatic background upload to central cloud server whenever any node regains LTE/Wi-Fi connectivity.
4. **Basic Cryptographic Integrity & Tamper Proofing**:
   - Canonical message hashing (SHA-256) and Ed25519 asymmetric signature generation on originating node.

---

### 2.3 Future & Advanced Features (Post-MVP Roadmap)
1. **Wi-Fi Direct High-Throughput Burst Mode**:
   - Automated escalation from BLE to Wi-Fi Direct for large file attachments or map tiles.
2. **ESP32 Static Solar-Powered Micro-Relay Nodes**:
   - Low-cost ($5) roadside beacon units installed on lampposts or trees to maintain physical store-carry-forward bridges across physical gaps.
3. **Emergency Web Responder Dashboard**:
   - Centralized incident map visualizing SOS locations, aggregated supply requests, and mesh topology density.
4. **Multi-Path Geographic Routing**:
   - Forwarding directed along directional vectors towards known rescue centers.

---

## 3. Explicit Non-Goals
To protect project focus and engineer a robust, mathematically verifiable networking foundation, the following are **explicitly out of scope**:

- **No Artificial Intelligence / Machine Learning**: Zero use of neural networks, LLMs, predictive ML routing, or probabilistic agents. The project strictly enforces deterministic, energy-frugal systems-engineering algorithms.
- **No General-Purpose Social Chatting**: MeshAid is strictly an emergency incident and relief logistics protocol, not a real-time conversational messaging app like WhatsApp or Telegram.
- **No Voice Calling or Real-Time Streaming**: BLE and opportunistic store-carry-forward topologies have intermittent, multi-minute or multi-hour latencies completely incompatible with synchronous audio/video streams.
- **No Centralized PKI / Certificate Authorities**: Offline disaster zones cannot contact certificate revocation lists or online trust authorities; identity must rely on decentralized cryptography (TOFU, local pairing, or municipal emergency keys).
- **No Cellular Infrastructure Dependence**: The core demo must succeed with SIM cards removed or airplane mode active with Bluetooth manually enabled.
