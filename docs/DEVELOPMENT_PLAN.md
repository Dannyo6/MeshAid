# MeshAid Phased Engineering & Development Plan

## Roadmap Overview
The development plan is divided into 13 strictly ordered phases (Phase 0 to Phase 12). Each phase establishes a stable, verifiable milestone before subsequent layers are introduced.

```
[Phase 0: Research & Environment Audit]
                   |
[Phase 1: Scaffolding & Protocol Simulator] <=== CURRENT MILESTONE
                   |
[Phase 2: BLE Discovery Engine]
                   |
[Phase 3: GATT Peer-to-Peer Transport]
                   |
[Phase 4: Message Protocol Implementation]
                   |
[Phase 5: Local Persistent Storage (SQLite/Room)]
                   |
[Phase 6: Store-Carry-Forward Relay Engine]
                   |
[Phase 7: Duplicate Suppression & Manifest Handshakes]
                   |
[Phase 8: Priority Scheduling & TTL Lifecycle]
                   |
[Phase 9: Cryptographic Integrity & Security Primitives]
                   |
[Phase 10: Gateway Cloud Synchronization]
                   |
[Phase 11: Emergency Responder Dashboard]
                   |
[Phase 12: 3-Device Physical Mesh Demonstration (A -> B -> C)]
```

---

## Detailed Phase Breakdown

### Phase 0: Research & Environment Setup *(Completed)*
- **Objectives**: Audit host environment, analyze wireless capabilities, evaluate Flutter vs Native Android/Kotlin, establish non-AI protocol boundaries.
- **Deliverables**: `docs/PROJECT_OVERVIEW.md`, `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_DECISION.md`, `docs/TECHNICAL_RESEARCH.md`.

### Phase 1: Project Scaffolding & Baseline CI *(Current Milestone)*
- **Objectives**: Set up repository directory structure, Git configuration, `.gitignore`, `.env.example`, basic GitHub Actions workflow, and a standalone protocol engine with a 3-node simulation test harness.
- **Deliverables**: Clean monorepo structure, `.github/workflows/ci.yml`, `packages/protocol`, `apps/mobile` native Android structure, `services/backend`, `apps/dashboard`.

### Phase 2: Peer Discovery Layer
- **Objectives**: Implement native Android BLE advertising (`BluetoothLeAdvertiser`) and background scanning (`BluetoothLeScanner`) filtered by MeshAid custom Service UUID.
- **Key Milestones**: Devices detect neighboring node IDs within 10–30 meters without pairing dialogs.

### Phase 3: Basic Peer-to-Peer Communication
- **Objectives**: Implement dual-role GATT Server (`BluetoothGattServer`) and GATT Client (`BluetoothGatt`). Establish bidirectional read/write characteristic channels.
- **Key Milestones**: Successfully negotiate 512-byte MTU and transmit a raw test byte payload between two physical devices.

### Phase 4: Message Protocol Serialization
- **Objectives**: Port the canonical message envelope specification into production Kotlin data classes and TypeScript models. Implement canonical serialization and CRC/SHA-256 validation.
- **Key Milestones**: Deterministic byte-for-byte serialization across Android and TypeScript runtimes.

### Phase 5: Local Persistence & Storage Layer
- **Objectives**: Implement SQLite / Room database schema on Android. Store incoming, outgoing, and relayed bundles with indexing on `id`, `priority`, `timestamp`, and `ttl`.
- **Key Milestones**: Bundles survive device reboots and app termination.

### Phase 6: Store-Carry-Forward Relay Engine
- **Objectives**: Implement the encounter state machine. When an encounter is detected, query stored bundles eligible for forwarding and execute bundle transfers.
- **Key Milestones**: Intermediate node stores a bundle, physically relocates, and forwards it upon discovering a new peer.

### Phase 7: Duplicate Prevention & Manifest Handshake
- **Objectives**: Implement manifest negotiation (`MANIFEST_OFFER` $\to$ `MANIFEST_REQUEST`) to prevent redundant transfers. Maintain in-memory Bloom filter and database index of `seen_message_ids`.
- **Key Milestones**: Re-encountered devices exchange zero payload bytes for already transferred messages.

### Phase 8: Priority Scheduling & TTL Pruning
- **Objectives**: Implement priority queues (P0 Authority Alerts $\to$ P1 SOS $\to$ P2 Logistics $\to$ P3 Bulletins). Implement periodic background worker pruning expired bundles (`timestamp + ttl < now`).
- **Key Milestones**: P1 SOS takes precedence over P3 bulletins during short encounter windows; expired packets are permanently purged.

### Phase 9: Cryptographic Security & Anti-Spam
- **Objectives**: Integrate Ed25519 keypair generation in Android Keystore. Digitally sign outgoing bundles; verify incoming signatures. Implement proof-of-work hash throttling for rate-limiting.
- **Key Milestones**: Tampered payloads are rejected with cryptographic verification errors.

### Phase 10: Gateway Cloud Synchronization
- **Objectives**: Implement network listener detecting active internet connectivity (LTE/Wi-Fi). Trigger background synchronization service uploading un-synced bundles via HTTPS/TLS to the backend.
- **Key Milestones**: Bundles carried out of the disaster zone automatically sync to cloud backend.

### Phase 11: Emergency Responder Dashboard
- **Objectives**: Build responsive web dashboard (React + Vite + Leaflet/MapLibre) displaying active SOS incidents, severity indicators, and resource logs.
- **Key Milestones**: Real-time incident updates streaming via WebSockets from gateway server.

### Phase 12: Comprehensive 3-Device Physical Demonstration
- **Objectives**: Execute full physical test protocol with three real hardware Android devices:
  - Phone A (Sender in Airplane Mode) creates SOS.
  - Phone B (Relay in Airplane Mode) walks into range of A, receives bundle, walks into range of C.
  - Phone C (Receiver in Airplane Mode) receives and alerts civilian SOS.
  - Direct RF communication between A and C confirmed impossible throughout test.
- **Key Milestones**: Video recording and packet log capture of complete end-to-end multi-hop relay.
