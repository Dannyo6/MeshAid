# MeshAid: Offline Emergency Communication & Relay Network

[![CI](https://github.com/Dannyo6/meshaid/actions/workflows/ci.yml/badge.svg)](https://github.com/Dannyo6/meshaid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Domain: Distributed Systems](https://img.shields.io/badge/Domain-Distributed%20Systems%20%7C%20Networks-orange.svg)](#)
[![Strict Non-AI](https://img.shields.io/badge/AI--Free-Adroit%20Rule%20Compliant-success.svg)](#)

> **"MeshAid is a resilient emergency communication network that enables critical messages to propagate opportunistically across intermittently connected devices until they reach a destination, responder, or gateway."**

---

## 📌 Project Overview

**MeshAid** is a decentralized, offline communication system developed as a student technical-club project under **ADROIT**. It operates on the principle of **Store-Carry-Forward** Delay/Disruption-Tolerant Networking (DTN).

During severe infrastructure failures (earthquakes, floods, grid blackouts, or remote search-and-rescue operations), commercial cellular towers and internet connections frequently collapse. MeshAid transforms standard smartphones into mobile, opportunistic relay nodes that communicate peer-to-peer using **Bluetooth Low Energy (BLE)** and **Wi-Fi Direct (P2P)**.

### 🚫 Non-AI Engineering Project
In strict accordance with ADROIT technical specifications, MeshAid is an **AI-free project**. It relies entirely on fundamental principles of:
- **Computer Networks** (Ad-hoc peer discovery, dual-role BLE GATT servers, wire protocol serialization, MTU fragmentation).
- **Distributed Systems** (Store-carry-forward DTN routing, priority queues, Bloom filter deduplication, TTL aging).
- **Cybersecurity** (Ed25519 asymmetric message signatures, SHA-256 integrity hashing, anti-flooding rate limits).

---

## 🎯 The Central Three-Device Proof-of-Concept

The foundational benchmark of MeshAid is the **Three-Device Relay Demonstration**:

```
[Phone A: Sender]               [Phone B: Relay Node]             [Phone C: Receiver]
       |                                  |                                |
       |-- 1. Creates SOS (P1)            |                                |
       |   (A & C out of range)           |                                |
       |                                  |                                |
       |==== 2. Node B enters range =====>|                                |
       |     BLE Encounter                |                                |
       |     Payload Transmitted          |                                |
       |--------------------------------->|                                |
       |                                  |-- 3. Stores in local DB        |
       |                                  |      Carries as node moves     |
       |                                  |                                |
       |                                  |==== 4. Enters range of C =====>|
       |                                  |     BLE Encounter              |
       |                                  |     Payload Transmitted        |
       |                                  |------------------------------->|
       |                                  |                                |-- 5. Verifies Integrity
       |                                  |                                |      Displays Emergency Alert
```

- **Phone A** generates an SOS while completely isolated from Phone C.
- **Phone B** acts as an intermediary relay, caching the packet in local non-volatile storage and physically carrying it.
- **Phone C** receives the intact, cryptographically verified SOS once Phone B comes into range.
- **No internet, no cellular connectivity, and zero direct A $\leftrightarrow$ C wireless link.**

---

## 📂 Repository Structure

```
meshaid/
├── README.md                  # Project identity, architecture, and quickstart
├── LICENSE                    # MIT License
├── CONTRIBUTING.md             # Developer workflow & commit conventions
├── SECURITY.md                # Vulnerability disclosure & cryptographic policy
├── .gitignore                 # Comprehensive ignore rules (Node, Android, Gradle, OS)
├── .env.example               # Safe environment variable template
│
├── docs/                      # Architectural & engineering specifications
│   ├── PROJECT_OVERVIEW.md    # Mission, context, and core demonstration
│   ├── ARCHITECTURE.md        # System components, data flows, and layer models
│   ├── ARCHITECTURE_DECISION.md # Evaluation of Native Android (Kotlin) vs. Flutter
│   ├── TECHNICAL_RESEARCH.md  # BLE, Wi-Fi Direct, Android background limits & DTN research
│   ├── MVP.md                 # Must-have, should-have, and explicit non-goals
│   ├── MESSAGE_PROTOCOL.md    # Canonical envelope schema, wire framing & handshakes
│   ├── SECURITY_DESIGN.md     # Threat model, Ed25519 signatures, and anti-flooding
│   └── DEVELOPMENT_PLAN.md    # 13-phase implementation roadmap
│
├── packages/
│   └── protocol/              # TypeScript protocol models, deduplication & 3-node simulation engine
│
├── apps/
│   ├── mobile/                # Native Android (Kotlin) mesh node application
│   └── dashboard/             # Emergency incident & telemetry responder dashboard
│
├── services/
│   └── backend/               # Gateway synchronization server (Node.js/Express)
│
└── .github/
    ├── workflows/ci.yml       # Automated CI workflow
    └── PULL_REQUEST_TEMPLATE.md
```

---

## ⚡ Quickstart & Local Protocol Verification

To run and verify the deterministic 3-node Store-Carry-Forward simulation test suite:

```bash
# Clone the repository
git clone https://github.com/Dannyo6/meshaid.git
cd meshaid

# Install dependencies in the protocol package
cd packages/protocol
npm install

# Run protocol unit tests and the 3-node relay simulation
npm test

# Build TypeScript protocol bundle
npm run build
```

---

## 🛡️ Priority Tiers

| Priority | Identifier | Description | Max Hops | Default TTL |
| :---: | :--- | :--- | :---: | :---: |
| **P0** | `EMERGENCY_AUTHORITY` | Official evacuation orders, dam releases, tsunami alerts | 12 | 72 hours |
| **P1** | `CIVILIAN_SOS` | Critical distress, medical emergency, trapped civilians | 7 | 48 hours |
| **P2** | `RESOURCE_LOGISTICS`| Clean water, medical supply requests, fuel availability | 4 | 24 hours |
| **P3** | `GENERAL_INFO` | Civilian welfare check-ins, road blockage reports | 2 | 12 hours |

---

## 🤝 Contributing
Contributions are governed by strict commit guidelines and protocol standards. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
