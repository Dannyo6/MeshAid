# MeshAid Technical Feasibility & Networking Research

## 1. Executive Summary
This document compiles empirical engineering research, platform constraints, and academic literature on Delay-Tolerant Networking (DTN) and local short-range wireless technologies (BLE and Wi-Fi Direct) to inform the design and implementation of MeshAid.

MeshAid acknowledges existing academic and open-source systems in opportunistic and disaster networking (e.g., Briar, Serval Project, FireChat, Disaster Radio, Meshtastic). MeshAid builds upon these proven paradigms to engineer an accessible, phone-to-phone store-carry-forward network tailored for civic emergency response without specialized radio hardware.

---

## 2. Wireless Technologies: Deep Feasibility Analysis

### 2.1 Bluetooth Low Energy (BLE)
BLE is the primary physical transport for neighbor discovery and opportunistic bundle transfer.

#### 1. Advertising Payload Constraints:
- **Legacy Advertising (BLE 4.x)**: Maximum advertising packet data payload is **31 bytes**. After reserving flags (3 bytes) and standard 128-bit Service UUID (16 bytes), only ~12 bytes remain for manufacturer or custom service data.
- **Extended Advertising (BLE 5.0+)**: Supports advertising packets up to **254 bytes** (secondary advertising channels). However, hardware support varies significantly across budget and older Android handsets.
- **Architectural Decision for MeshAid**: Use advertising **strictly for presence announcement** (broadcasting a 16-byte custom Service UUID and an 8-byte Node ID). Full payload transfers and manifest handshakes must occur over an established **GATT connection**, not inside raw advertising packets.

#### 2. GATT Connection & MTU Realities:
- **Default ATT MTU**: 23 bytes (leaving 20 bytes of effective payload per ATT packet after 3-byte ATT header).
- **MTU Negotiation**: Android supports `BluetoothGatt.requestMtu(512)`. When negotiated successfully with a modern peer, effective payload per transmission increases to 509 bytes.
- **Throughput**: Effective throughput over BLE GATT in field conditions ranges from 5 KB/s to 50 KB/s depending on PHY (1M vs 2M PHY) and connection interval (typically 15 ms to 48 ms).
- **Implication**: Highly suited for short emergency packets (SOS, coordinates, text bulletins of 100–1000 bytes). Unsuitable for raw media or high-resolution maps without heavy compression and fragmentation.

#### 3. Dual-Role Architecture (Central + Peripheral):
- Standard smartphones can operate concurrently as:
  - **Peripheral (Advertiser / GATT Server)**: Continuously beacons presence and listens for inbound GATT connections.
  - **Central (Scanner / GATT Client)**: Scans for neighbor beacons, initiates connections to newly discovered nodes, and pushes or requests queued bundles.
- **Android Support**: Dual-role support was introduced in Android 5.0 (API 21) via `BluetoothLeAdvertiser` and `BluetoothGattServer`. It is universally supported on modern Android chipsets (Qualcomm, MediaTek, Exynos).

---

### 2.2 Wi-Fi Direct (Wi-Fi P2P)
Wi-Fi Direct enables direct high-speed connections between devices without a wireless router.

#### Feasibility & Constraints:
- **Throughput**: Exceeds 10–50 Mbps, ideal for bulky bulletins, triage logs, and offline satellite map tile distribution.
- **Group Owner (GO) Negotiation Overhead**: Wi-Fi Direct requires a dynamic 2-way handshake to negotiate which device acts as Group Owner (Access Point) and which acts as Client. This handshake requires 3 to 10 seconds to establish.
- **User Prompts / Permissions**: Historically, Android required explicit user confirmation dialogs to accept Wi-Fi Direct invitations. Android 10+ streamlined this via `WifiP2pManager`, but unexpected disconnections remain common.
- **Energy Consumption**: Wi-Fi Direct consumes 5x to 10x more battery power than BLE.
- **Role in MeshAid**: Wi-Fi Direct is designated as a **Phase 2 secondary transport** for high-volume data bursts, while BLE serves as the persistent, low-power discovery and control channel.

---

## 3. Android Platform & OS Background Constraints

Modern Android operating systems (Android 11, 12, 13, 14, and 15) enforce strict background execution limits to protect battery life:

1. **Doze Mode & App Standby**:
   - When a device is stationary, unplugged, and screen-off, the OS enters Doze mode, cutting off network scans and alarms except during rare maintenance windows.
   - *Mitigation*: MeshAid must employ an Android **Foreground Service** displaying a persistent notification indicating active emergency monitoring. The service must declare `android:foregroundServiceType="connectedDevice|dataSync"` (Android 14+ requirement).
   - The user must be guided to grant exemption from battery optimization (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).
2. **Bluetooth Permissions Evolution**:
   - Prior to Android 12: Required runtime `ACCESS_FINE_LOCATION` to scan for Bluetooth devices.
   - Android 12+ (API 31+): Requires granular runtime permissions:
     - `android.permission.BLUETOOTH_SCAN` (with `neverForLocation` flag if GPS coordinates are not derived from beacons)
     - `android.permission.BLUETOOTH_ADVERTISE`
     - `android.permission.BLUETOOTH_CONNECT`
3. **Duty-Cycling (Battery Preservation)**:
   - Continuous scanning rapidly drains battery. MeshAid implements a duty-cycled scanner: e.g., scan for 10 seconds, sleep for 20 seconds, advertising continuously with low-frequency beacons.

---

## 4. Delay-Tolerant & Opportunistic Routing Paradigms

Opportunistic networking relies on human and vehicular mobility to bridge physical network partitions:

### 4.1 Routing Strategies Evaluated:
1. **Epidemic Routing (Flooding)**:
   - Nodes replicate bundles to every encountered peer that lacks them.
   - *Pros*: Maximizes delivery ratio; minimizes delivery latency in sparse networks.
   - *Cons*: High buffer congestion, excessive battery drain, packet collisions.
2. **Spray and Wait**:
   - The source node creates $L$ copies of a bundle. In the "Spray" phase, copies are distributed to $L$ distinct encountered nodes. In the "Wait" phase, nodes hold the message until directly encountering the destination or a gateway.
   - *Pros*: Strictly bounds resource utilization and packet replication.
   - *Cons*: Slower propagation in critical disaster SOS scenarios.
3. **PRoPHET (Probabilistic Routing Protocol using History of Encounters and Transitivity)**:
   - Uses historical encounter predictability to forward bundles only to nodes more likely to encounter the destination.
   - *Cons*: In sudden disaster scenarios, historical patterns are disrupted, making probabilistic matrices unreliable.

### 4.2 MeshAid Hybrid Approach:
- **Priority-Differentiated Epidemic with Controlled Quota**:
  - **P0 / P1 (Emergency Authority & SOS)**: Uses controlled epidemic flooding with a high hop limit (e.g., Max Hops = 7) and aggressive TTL (e.g., 48 hours) to guarantee rapid propagation to any responder or gateway.
  - **P2 / P3 (Resource Logistics & General Info)**: Uses Spray and Wait with low hop limits (Max Hops = 3) to prevent buffer exhaustion.
  - **Bloom Filters / Manifest Exchanges**: Every encounter initiates an exchange of known Message IDs. Nodes only transfer missing bundles.

---

## 5. Prior Art & Comparative Landscape

| System / Project | Radio Layer | Routing Model | Architectural Differences from MeshAid |
| :--- | :--- | :--- | :--- |
| **Briar** | Tor / Wi-Fi / BLE | P2P secure forum | Focused on anti-censorship and end-to-end encrypted private messaging; high storage overhead, complex contact onboarding (QR code scanning required). MeshAid focuses on open civic emergency broadcast and triage. |
| **Bridgefy** | Proprietary BLE | Multi-hop mesh | Closed-source commercial protocol; suffered severe historical cryptographic vulnerabilities (no message authentication or replay protection). MeshAid is open, verifiable, and non-commercial. |
| **Serval Project** | Ad-hoc Wi-Fi 802.11b | Batphone mesh | Relied heavily on rooted Android phones and ad-hoc Wi-Fi modes (IBSS), which modern Android versions have deprecated. |
| **Meshtastic** | LoRa (433/868/915 MHz)| Flood mesh | Outstanding long-range performance (~5–15 km), but mandates external hardware radios (ESP32 + Semtech SX1262). MeshAid operates on commodity, unmodified consumer smartphones. |

---

## 6. Confirmed Facts, Constraints & Assumptions

### Confirmed Facts:
- Commodity Android smartphones can concurrently advertise and scan over BLE.
- BLE GATT connections allow bidirectional streaming of negotiated 512-byte MTU buffers.
- Android background execution requires a sticky Foreground Service with explicit service types.
- Pure opportunistic store-carry-forward can achieve message delivery without internet or direct A-C physical connectivity.

### Explicit Constraints:
- Zero cloud/internet dependence for core offline operation.
- Zero AI/ML models permitted per project mandate.
- Physical transmission range per hop over standard smartphone BLE is typically 10 to 30 meters outdoors, reduced by walls/rubble.
- BLE bandwidth is strictly limited; packet designs must be compact (binary or minified JSON).

### Assumptions:
- In an emergency zone, enough civilian volunteers or responders move through sectors to provide mobility for store-carry-forward propagation.
- Devices have sufficient battery or can be recharged via portable power banks.

### Unresolved Research Questions for Future Phases:
1. What is the optimal BLE scan/sleep duty cycle that balances encounter discovery latency against battery life across an 8-hour shift?
2. How do different Android vendor battery managers (e.g., MIUI, OneUI, ColorOS) interact with continuous BLE advertising in foreground services?
3. Should packet encryption use pre-distributed municipal public keys, or purely opportunistic signing? (Addressed in `SECURITY_DESIGN.md`).
