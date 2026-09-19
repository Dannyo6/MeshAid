# MeshAid: Offline Emergency Communication & Relay Network

## Project Identity
- **Project Name**: MeshAid
- **Full Title**: MeshAid: Offline Emergency Communication & Relay Network
- **Author**: Dhanush V
- **Project Type**: Independent Systems Engineering & Research Project
- **Short Description**: MeshAid is a resilient emergency communication network that enables critical messages to propagate opportunistically across intermittently connected devices until they reach a destination, responder, or gateway.
- **Core Concept**: **Store-Carry-Forward Communication** (Delay/Disruption-Tolerant Networking)

---

## 1. Problem Statement
During severe natural disasters and civic emergencies—such as floods, earthquakes, landslides, extensive power grid failures, or remote-area crises—conventional cellular base stations and centralized internet infrastructure frequently collapse or become hopelessly congested. 

Standard communications mandate a continuous topological path:
$$\text{User} \longrightarrow \text{Cellular / Wi-Fi Base Station} \longrightarrow \text{Centralized Server} \longrightarrow \text{Recipient}$$

When the backhaul fails or base stations lose power, traditional devices are rendered inoperative, leaving victims, civilian volunteers, and first responders unable to transmit emergency signals, announce shelters, or coordinate relief logistics.

---

## 2. The Solution: Opportunistic Mesh & Store-Carry-Forward
MeshAid fundamentally breaks reliance on centralized infrastructure by treating every smartphone as an autonomous, mobile store-carry-forward relay node. 

Instead of requiring an instantaneous, end-to-end connected path between sender and receiver, MeshAid utilizes **opportunistic encounter-based routing**:
$$\text{Device A} \xrightarrow{\text{Encounter}} \text{Device B (Store \& Carry)} \xrightarrow{\text{Physical Mobility}} \text{Device B} \xrightarrow{\text{Encounter}} \text{Device C (Deliver)}$$

An intermediate node (Device B) does not require a simultaneous link to Device C. It caches the emergency packet in non-volatile local storage, physically carries it as the user or vehicle moves through the disaster zone, and forwards it wirelessly when another node enters short-range proximity.

---

## 3. Strict Non-AI Engineering Mandate
MeshAid is intentionally engineered under a rigorous, foundational **non-AI architectural mandate**. 

In emergency scenarios with degraded or collapsed infrastructure, relying on probabilistic AI inference, large parameter models, or neural networks introduces non-deterministic failure modes, prohibitive battery consumption, and unpredictable latency. MeshAid enforces absolute determinism, transparency, and computational frugality by operating strictly on verifiable systems-engineering principles:
- **Prohibited technologies**: Machine Learning, Deep Learning, Large Language Models (LLMs), RAG, Agentic AI, Generative AI, Computer Vision, or heuristic AI automations.
- **Primary engineering domains**:
  - **Computer Networks**: Protocol design, packet serialization, MTU management, dual-role BLE (GATT Server/Client), Wi-Fi Direct (P2P), ad-hoc peer discovery.
  - **Distributed Systems**: Delay-Tolerant Networking (DTN), eventual consistency, epidemic dissemination, vector clocks/manifest exchange, duplicate suppression, priority scheduling, TTL-bounded caching.
- **Supporting domains**: Cybersecurity (cryptographic signatures, integrity verification, replay defenses), Mobile Computing, Edge Computing, and IoT (ESP32 micro-relays).

---

## 4. Central Proof-of-Concept Demonstration
The foundational technical validation of MeshAid is the **Three-Device Relay Demonstration**:

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

**Key Validation Criteria**:
1. Phone A and Phone C **never directly communicate** (placed beyond physical wireless range or isolated by RF attenuation).
2. Zero cellular and zero internet access enabled on all three devices.
3. Message successfully arrives at Phone C via Phone B with cryptographic integrity preserved, duplicate re-transmissions suppressed, and priority respected.

---

## 5. Architectural Positioning
MeshAid is **not an offline chat app**. It is an **opportunistic emergency transport protocol and relay engine** designed to survive intermittent topology and partition-heavy network environments.
