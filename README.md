# MeshAid

**Zero-Infrastructure Decentralized Emergency Mesh Network & Tactical C2 Telemetry System**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Engine: TypeScript / Kotlin](https://img.shields.io/badge/Stack-TypeScript%20%7C%20Kotlin%20%7C%20React-orange.svg)](#)
[![Protocol: 96--Byte Binary Wire](https://img.shields.io/badge/Protocol-96--Byte%20Binary%20Wire%20v1-success.svg)](#standardized-96-byte-wire-protocol-specification)
[![Security: Ed25519 Signed](https://img.shields.io/badge/Security-Ed25519%20Signed-red.svg)](#)
[![Architecture: Strictly Non-AI](https://img.shields.io/badge/Architecture-Strictly%20Deterministic%20(Non--AI)-lightgrey.svg)](#)

---

## 1. Executive Summary

**MeshAid** is a resilient, delay-tolerant emergency communications network engineered for rapid deployment during complete telecommunication infrastructure failure (earthquakes, severe hurricanes, power grid blackouts, or remote search-and-rescue operations).

Operating under an intentional, strictly deterministic non-AI mandate, MeshAid enables peer-to-peer **Delay-Tolerant Networking (DTN)** using **Store-Carry-Forward** routing over native **Bluetooth Low Energy (BLE)** on commercial off-the-shelf (COTS) Android devices.

### Core Value Proposition
- **Zero External Hardware:** Runs entirely on standard consumer smartphones without requiring specialized Software Defined Radios (SDRs), LoRa hardware dongles, satellite transceivers, or cellular backbones.
- **Physical Data Mules:** When network partitions divide disaster zones, mobile nodes physically carry cryptographically signed telemetry and opportunistically discharge packets when coming within radio range of other nodes or internet-connected edge sinks.
- **Cryptographic Trust:** Every emergency frame is immutably signed at source via asymmetric Ed25519 keypairs, binding the geographic coordinates, priority, and payload against in-transit tampering and replay attacks.
- **End-to-End Incident Command:** Automatically uplinks ingested field telemetry to an incident command base station and presents real-time triage feeds on a tactical Command & Control (C2) console.

---

## 2. System Architecture

The following diagram maps the complete end-to-end data lifecycle across physical disaster partitions—from an offline victim to an emergency command operations center:

```
+----------------------------------------------------------------------------------------------------+
|                                    DISASTER IMPACT ZONE (OFFLINE)                                   |
|                                                                                                    |
|  [ Node A: Victim SOS ]                                                                            |
|  - Generates P1 SOS Telemetry                                                                      |
|  - Signs frame with Ed25519 Private Key                                                            |
|  - Encodes 96-Byte Binary Frame + JSON Payload                                                     |
|  - Broadcasts via BLE 5.0 Extended Adv (or Legacy Chunks)                                          |
|         |                                                                                          |
|         | (10-40m RF Encounter / No Cellular / No Internet)                                         |
|         v                                                                                          |
|  [ Node B: Mobile Relay / Data Mule ]                                                              |
|  - Receives frame via BLE Background Scanner                                                       |
|  - Reassembles multi-chunk payload (100-session LRU Buffer)                                        |
|  - Cryptographically verifies Ed25519 signature & validates TTL                                    |
|  - Stores in local Room SQLite (Priority Queue: P0 -> P1 -> P2 -> P3)                              |
|  - Physically moves across partition boundary (Store-Carry-Forward)                                |
|  - Increments Hop Count (drop if >= 7) and re-advertises to nearby peers                           |
+----------------------------------------------------------------------------------------------------+
                                           |
                                           | (Physical Mobility across partition)
                                           v
+----------------------------------------------------------------------------------------------------+
|                                      EDGE ZONE (RESTORED UPLINK)                                   |
|                                                                                                    |
|  [ Node C: Sink Handset / Internet Gateway ]                                                       |
|  - Ingests wire frame over BLE encounter with Node B                                               |
|  - ConnectivityManager detects active Wi-Fi / LTE Uplink                                           |
|  - Automated Sync flushes buffered wire frames via HTTP POST Base64                                |
+----------------------------------------------------------------------------------------------------+
                                           |
                                           | HTTPS / POST /api/mesh/sync
                                           v
+----------------------------------------------------------------------------------------------------+
|                                 TACTICAL COMMAND BASE STATION (C2)                                 |
|                                                                                                    |
|  [ services/backend: Ingestion & Gateway ]                                                         |
|  - Decodes 96-byte wire frame from Base64 string                                                   |
|  - Validates Magic Bytes (0x4D 0x41), Version, and Ed25519 signature                               |
|  - SHA-256 Message Deduplication via SQLite persistence layer                                      |
|  - Dispatches WebSocket Event (EVENT_NEW_INCIDENT) to active subscribers                           |
|         |                                                                                          |
|         | WebSocket (ws://localhost:3000)                                                          |
|         v                                                                                          |
|  [ apps/dashboard: Tactical Incident Command Console ]                                             |
|  - High-contrast C2 Terminal with dark-filtered OpenStreetMap GIS Canvas                           |
|  - Incident Triage Stream with live priority sorting (P1 Distress, P2 Logistics, P3 Info)           |
|  - Raw 96-Byte Hex Frame Inspector & Automated Headcount / Casualty Aggregation                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Standardized 96-Byte Wire Protocol Specification

MeshAid communicates using a fixed-width 96-byte binary header followed by a variable-length UTF-8 JSON payload. All multi-byte numeric fields are encoded in **Big-Endian (Network Byte Order)**.

### Binary Header Layout

| Byte Offset | Size | Field Name | Data Type | Description |
| :--- | :--- | :--- | :--- | :--- |
| `00..01` | 2B | **Magic Bytes** | `0x4D 0x41` | ASCII `"MA"` framing identifier for rapid packet rejection. |
| `02` | 1B | **Version** | `UInt8` | Protocol version (Fixed to `0x01`). |
| `03` | 1B | **Priority Tier** | `UInt8` | `0x00` = P0 (Authority), `0x01` = P1 (SOS), `0x02` = P2 (Logistics), `0x03` = P3 (Info). |
| `04..05` | 2B | **Hop Count** | `UInt16 BE` | Current forward count. Incremented at each hop. Dropped if $\ge 7$. |
| `06..13` | 8B | **Message ID** | `8 Bytes` | Truncated SHA-256 hash of sender public key, timestamp, and payload. |
| `14..17` | 4B | **Timestamp** | `UInt32 BE` | Epoch seconds of message creation. |
| `18..21` | 4B | **TTL** | `UInt32 BE` | Time-to-Live duration in seconds. Expired packets are dropped. |
| `22..25` | 4B | **Latitude** | `Float32 BE` | WGS84 Latitude encoded as IEEE 754 single-precision float. |
| `26..29` | 4B | **Longitude** | `Float32 BE` | WGS84 Longitude encoded as IEEE 754 single-precision float. |
| `30..31` | 2B | **Payload Length** | `UInt16 BE` | Byte length $N$ of the trailing JSON payload. |
| `32..95` | 64B | **Ed25519 Signature** | `64 Bytes` | Asymmetric cryptographic signature covering bytes `00..31` + payload. |
| `96..End` | $N$ B | **Variable Payload** | `UTF-8 JSON` | Canonical telemetry payload: `headcount`, `situation`, `supplies`, `sector`. |

### Cryptographic Binding
- The 64-byte Ed25519 signature is calculated over the canonical pre-image `[Header Bytes 00..31 || Payload Bytes 96..96+N]`.
- Receivers verify the signature using the sender's public key (derived or transmitted in registration). Tampered coordinates, corrupted hop counts, or modified payloads invalidate the signature, causing instantaneous frame rejection before persistence.

---

## 4. Engineering Highlights & Hardening Implementation

### Dual-Mode BLE Radio Architecture
- **BLE 5.0 Extended Advertising:** Transmits un-fragmented wire frames up to 254 bytes per advertising event on supported chipsets via secondary advertising physical channels (`PHY_LE_1M` / `PHY_LE_CODED`).
- **Legacy 24-Byte Chunking Fallback:** Automatically degrades to legacy BLE 4.x primary channels (37, 38, 39) with custom 4-byte chunk headers:
  `[SessionID: 2B] [ChunkIdx: 1B] [TotalChunks: 1B] [Data: <=20B]`.

### Reassembly Buffer Hardening (DoS Mitigation)
- **100-Session LRU Cache:** Limits active concurrent reassembly sessions to 100 to prevent heap exhaustion.
- **Sliding 30-Second TTL:** Discards incomplete fragment chains when the time delta between consecutive chunks exceeds 30 seconds.
- **Strict Boundary Checks:** Drops malformed chunks where chunk index $i \ge n$ or total chunk count $n \notin [1, 16]$.

### Room SQLite Persistence & Priority Eviction
- **Deterministic Queue Ordering:** Packets are indexed and queried strictly via `ORDER BY priority ASC, createdAt DESC`.
- **Active Memory-Pressure Eviction:** Under device storage pressure or maximum packet quotas (10,000 records), low-priority records (`P3_GENERAL_INFO` and `P2_LOGISTICS`) are automatically purged while preserving `P1_CIVILIAN_SOS` and `P0_AUTHORITY`.

### Automated Uplink Synchronization
- **Network State Observer:** An Android `ConnectivityManager.NetworkCallback` monitors cellular and Wi-Fi interface transitions.
- **Transactional Base64 Synchronization:** On network acquisition, unsynchronized packets are retrieved from SQLite, encoded into Base64 wire frames, and POSTed to `/api/mesh/sync`. Upon HTTP `200 OK`, local records are marked synchronized.

### OEM Background Hardening
- **Native Android Foreground Service:** Runs `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` with a persistent low-priority system notification to prevent Android LMK (Low Memory Killer) termination.
- **Partial CPU Wake Locks:** Acquires a `PowerManager.PARTIAL_WAKE_LOCK` during active scan and broadcast bursts.
- **Doze & Battery Optimization Bypass:** Invokes `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` to ensure radio polling continues while the device is stationary with screen off.

### Tactical Command Dashboard (C2)
- **Zero API-Key GIS Engine:** Built with Leaflet using free OpenStreetMap raster tiles darkened via custom high-contrast CSS filters (`invert`, `contrast`, `hue-rotate`), eliminating cloud map vendor dependencies.
- **Real-Time WebSocket Stream:** Instantly renders incoming distress signals with pulsating tactical beacons and NATO priority markers (`[P1:SOS]`, `[P2:SUP]`, `[P3:INF]`).
- **Raw Hex Inspector:** Allows incident commanders to audit raw 96-byte packet memory frames directly from the interface.

---

## 5. Monorepo Structure

```
meshaid/
├── packages/
│   └── protocol/              # TypeScript 96-byte wire codec, Ed25519 signing, DTN simulation tests
│       ├── src/               # Codec implementation, priority types, bitwise helpers
│       ├── test/              # 3-node store-carry-forward test suite & boundary checks
│       └── package.json
│
├── apps/
│   ├── mobile/                # Native Android (Kotlin) DTN Mesh Node Application
│   │   ├── app/src/main/java/ # BleService, Room Database, ChunkReassembler, UplinkWorker
│   │   └── build.gradle.kts
│   │
│   └── dashboard/             # Tactical Incident Command C2 Interface (React + Vite + TS)
│       ├── src/components/    # TacticalMap, IncidentCard, TriageKpiRow, TopHud, reactbits/
│       ├── Dockerfile         # Multi-stage Nginx production container
│       └── nginx.conf         # Reverse proxy routing /api and /ws to backend:3000
│
├── services/
│   └── backend/               # Gateway Base Station Server (Node.js + Express + WebSocket)
│       ├── src/               # /api/mesh/sync ingestion, SQLite store, WSS broadcast
│       ├── scripts/           # simulate_e2e.ts end-to-end telemetry harness
│       ├── Dockerfile         # Multi-stage Node 20 Alpine container
│       └── package.json
│
├── docker-compose.yml         # One-click multi-container base station stack
├── LICENSE                    # MIT Open Source License
└── README.md                  # System specification & runbook
```

---

## 6. Runbook & Deployment Instructions

### Option A: One-Click Base Station (Docker Compose)

Deploy the complete base station (Backend API, SQLite telemetry store, WebSocket bridge, and Tactical Dashboard) with a single command:

```bash
docker compose up --build -d
```

- **Tactical Command Dashboard:** [http://localhost](http://localhost) (or port `5173`)
- **Backend REST API:** [http://localhost:3000](http://localhost:3000)
- **WebSocket Ingestion Stream:** `ws://localhost:3000`
- **Healthcheck Verification:**
  ```bash
  curl http://localhost:3000/api/health
  # Expected: {"status":"healthy","uptime":...}
  ```

---

### Option B: Multi-Workspace Manual Development

#### 1. Protocol Package (Validation & Testing)
```bash
cd packages/protocol
npm install
npm test
npm run build
```

#### 2. Services Backend (Gateway & Ingestion)
```bash
cd services/backend
npm install
npm run build
npm start

# In a separate shell, execute the authentic End-to-End wire simulation:
npm run test:e2e
```

#### 3. Apps Dashboard (Tactical C2 Console)
```bash
cd apps/dashboard
npm install
npm run dev
# Dashboard launches at http://localhost:5173
```

#### 4. Native Android Mobile Application
```bash
cd apps/mobile
# Compile Debug APK via Gradle wrapper
.\gradlew.bat assembleDebug

# Output APK path:
# apps/mobile/app/build/outputs/apk/debug/app-debug.apk
```

---

### Android Sideloading & Permission Grants

Deploy the mobile mesh node to a physical test device via ADB:

```bash
# Sideload the compiled APK
adb install -r apps/mobile/app/build/outputs/apk/debug/app-debug.apk

# Grant required runtime permissions for BLE Advertising, Scanning, and GPS
adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_SCAN
adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_CONNECT
adb shell pm grant dev.meshaid.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant dev.meshaid.app android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant dev.meshaid.app android.permission.POST_NOTIFICATIONS

# Whitelist application from Android Doze / Battery Optimization
adb shell dumpsys deviceidle whitelist +dev.meshaid.app
```

---

## 7. Research Gap & Real-World Failure Boundaries Matrix

| Evaluation Dimension | **MeshAid** (This Project) | **Meshtastic** | **Briar / Bridgefy** |
| :--- | :--- | :--- | :--- |
| **Physical RF Layer** | Standard 2.4 GHz BLE (COTS Smartphone) | Sub-GHz LoRa (433 / 868 / 915 MHz) | Wi-Fi Direct / Hybrid BLE |
| **Hardware Prerequisite** | **Zero External Hardware** (Standard Handset) | Requires ESP32/nRF52 + SX1262 Radio Module | Zero External Hardware (Standard Handset) |
| **Transmission Range** | **10 – 40 meters** per direct hop | **2 – 15+ kilometers** line-of-sight | **10 – 60 meters** |
| **Data Throughput** | ~1 – 2 Mbps (Burst Advertising) | ~0.1 – 5 kbps (Extremely Narrowband) | ~2 – 50 Mbps (Wi-Fi P2P Group) |
| **Routing Paradigm** | Store-Carry-Forward (DTN) | Flood / Managed Mesh (Synchronous) | Epidemic DTN / Wi-Fi Cluster |
| **Cryptographic Model** | Ed25519 Source-Signed + SHA-256 ID | Pre-shared AES-256 / Ed25519 | TLS over P2P / Tor Onion Routing |
| **Victim Adoption Barrier** | **Extremely Low** (Install APK on existing phone) | **High** (Requires pre-purchased hardware) | **Low** (Install app prior to disaster) |

---

### Candid Real-World Limitations

1. **RF Propagation & Physical Attenuation:**
   Standard 2.4 GHz Bluetooth Low Energy signals attenuate rapidly through reinforced concrete, rubble, soil, and dense foliage, limiting realistic transmission ranges to 10–25 meters indoors and up to 40 meters outdoors. MeshAid relies directly on **physical human mobility** (data mules walking or driving between sectors) rather than multi-kilometer wireless links.

2. **Primary Channel Congestion (Channels 37, 38, 39):**
   Legacy BLE advertising packets are broadcast across three uncoordinated 2 MHz channels without carrier-sense multiple access with collision avoidance (CSMA/CA) backoff mechanisms. High device densities ($>50$ broadcasting nodes in a tight perimeter) induce elevated packet collision rates, necessitating randomized transmission jitter and extended advertising intervals.

3. **OEM Aggressive Background Task Termination:**
   Despite configuring Foreground Services and requesting battery optimization exemptions, customized Android vendor skins (e.g., Xiaomi MIUI/HyperOS, Samsung OneUI, Huawei EMUI) enforce proprietary background task killers that can suspend BLE scanning intervals after prolonged screen-off periods. Devices must be configured via vendor settings to allow unconstrained background execution.

---

## 8. License

This project is licensed under the terms of the **MIT License**. See [LICENSE](LICENSE) for complete details.
