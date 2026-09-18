# MeshAid Security Architecture & Threat Model

## 1. Security Philosophy
Emergency communication systems face unique operational trade-offs between **strict cryptographic gating** and **civilian survivability**:
- Overly rigid cryptographic requirements (e.g. requiring real-time internet Certificate Authority checks) cause system failure when connectivity collapses.
- Absence of security enables malicious nodes to forge evacuation orders, replay outdated distress signals, or flood the physical mesh buffer with spam.

MeshAid adopts an **opportunistic defense-in-depth model** utilizing established, non-custom cryptographic primitives (Ed25519, SHA-256, AES-GCM).

---

## 2. Cryptographic Primitives & Identity

### 2.1 Node Identity Generation
- Upon first initialization, every MeshAid node generates an **Ed25519 keypair** in the hardware-backed Android Keystore:
  $$\text{NodeID} = \text{SHA-256}(\text{PublicKey}_{\text{Ed25519}})[0..7]$$
- No centralized Certificate Authority (CA) is contacted. 
- The public key is bundled with every transmitted message envelope, allowing any intermediate or receiving node to verify that the message originated from the stated `sender_id`.

### 2.2 Integrity & Non-Repudiation
- **Canonical Envelope Hashing**: Canonical serialization of envelope fields (excluding the signature field) is hashed using **SHA-256**.
- **Digital Signature**: The originating node signs the hash using its Ed25519 private key.
- **Relay Rule**: Relays **never** modify the original payload, `sender_id`, `timestamp`, or `signature`. They only increment `hop_count`. The signature validates against the immutable core fields. Any tampering by an intermediate node invalidates the signature and causes immediate packet rejection.

---

## 3. Confidentiality vs. Triage Accessibility

### 3.1 Public Emergency Broadcasts (SOS & Bulletins)
- **Design Decision**: P0 (Authority Alerts), P1 (Civilian SOS), and P3 (Public Bulletins) are **cryptographically signed but unencrypted (plaintext)**.
- **Rationale**: In a disaster zone, any civilian volunteer, doctor, or first responder who intercepts a distress signal must be able to immediately inspect coordinates, injury status, and medical needs without requiring pre-negotiated private keys.

### 3.2 Private Direct Communications
- For direct 1-to-1 civilian or responder communications (`recipient_id != "BROADCAST"`):
  - Key exchange: **X25519** ECDH shared secret derived from recipient's advertised public key.
  - Encryption: **AES-256-GCM** or **ChaCha20-Poly1305** authenticated encryption with random 96-bit nonce.

---

## 4. Threat Modeling & Attack Mitigations

| Threat Vector | Attack Mechanism | MeshAid Mitigation Strategy |
| :--- | :--- | :--- |
| **Payload Tampering** | Malicious relay modifies coordinates or severity to divert rescue teams. | **Ed25519 Signature Verification**: Receiving nodes and gateways verify that the payload matches the originator's signature. Tampered packets are immediately dropped. |
| **Replay Attacks** | Attacker replays an old SOS from 3 days prior, wasting responder resources. | **Temporal Window & Deduplication**: Packets carry UTC timestamps and TTL. Packets with `CurrentTime > Timestamp + TTL` or timestamps skewing $> 1$ hour into the future are rejected. |
| **Mesh Buffer Flooding (DoS)** | Rogue node broadcasts thousands of dummy packets to exhaust phone memory and battery. | **Storage Quotas & Rate-Limiting**: <br>1. Local storage bounded to 50 MB.<br>2. Per-Node Quota: Maximum 5 active packets per unknown `sender_id`.<br>3. Priority Partitioning: P0/P1 guaranteed 70% of storage buffer.<br>4. Manifest filtering rejects unknown bulk batches. |
| **Sybil Attack** | Attacker generates thousands of random Node IDs to bypass per-node quotas. | **Lightweight Proof-of-Work (PoW)**: Message IDs must satisfy a 12-bit leading zero PoW hash condition (`SHA-256(Envelope + Nonce) < Target`), requiring ~200ms CPU compute per message on phone, preventing high-frequency flood generation. |
| **Rogue Authority Alerts** | Attacker broadcasts fake P0 evacuation or dam breach alert. | **Pre-Loaded Responder Public Keys**: Official responder and disaster authority public keys are bundled into app releases. P0 alerts without a recognized authority signature are demoted to unverified P3 general notices. |
| **Eavesdropping / Tracking** | Passive BLE sniffer monitors device MAC addresses to track citizen movements. | **BLE MAC Randomization**: Modern Android OS automatically randomizes advertiser MAC addresses every 15 minutes. Node IDs in beacons can be rotated ephemerally. |

---

## 5. Gateway Ingestion Security

When a node synchronizes queued bundles to the internet cloud gateway:
1. All network communication requires **TLS 1.3**.
2. Gateway checks each bundle's cryptographic signature against the attached public key.
3. Gateway runs automated deduplication against the central PostgreSQL / MongoDB cluster.
4. Alerts originating from verified emergency service keys are instantly highlighted with highest audit trust on the responder dashboard.
