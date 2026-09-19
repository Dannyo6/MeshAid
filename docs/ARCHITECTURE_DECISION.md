# Architecture Decision Record (ADR-001)

## Title: Mobile Technology Selection & Core Protocol Decoupling

- **Status**: Accepted
- **Date**: 2026-09-18
- **Authors**: MeshAid Systems Architecture Team
- **Deciders**: Technical Leads, Systems Architecture

---

## 1. Context & Problem Statement
MeshAid requires building an offline emergency communication and store-carry-forward relay network where physical devices communicate without cellular or internet infrastructure.

The core wireless mechanism demands:
1. **Simultaneous Dual-Role BLE**: Each device must concurrently act as a **GATT Server (Peripheral)** advertising presence and receiving payload writes, and a **GATT Client (Central)** scanning for nearby peers and connecting to initiate bundle handshakes.
2. **Resilient Background Execution**: Encounters occur opportunistically while the phone is locked or in a user's pocket. The app must maintain background advertising and periodic scanning under aggressive Android battery optimizations (Doze mode, App Standby Buckets).
3. **Future Wi-Fi Direct Integration**: High-bandwidth data transfers (emergency bulletins, resource maps, medical data) require Wi-Fi Direct (P2P) Group Owner negotiation and raw TCP socket streaming.
4. **Reliable Multi-Device Physical Testing**: Seamless deployment and direct debugging across at least three physical test devices (Node A, Node B, Node C).

We evaluated two primary options:
- **Option A**: Flutter (Cross-platform Dart framework)
- **Option B**: Native Android (Kotlin) with a Decoupled Protocol Engine

---

## 2. Comprehensive Technology Evaluation

| Evaluation Criteria | Option A: Flutter | Option B: Native Android (Kotlin) | Analysis & Impact |
| :--- | :--- | :--- | :--- |
| **BLE GATT Server (Peripheral Mode)** | **Poor / Fragile**<br>Popular plugins (`flutter_blue_plus`, `reactive_ble`) strictly support Central mode only. Peripheral plugins (`flutter_ble_peripheral`) are poorly maintained, unstable, or crash on Android 13+. | **Native & Complete**<br>Direct access to `BluetoothLeAdvertiser`, `BluetoothGattServer`, and `BluetoothGattServerCallback`. Full control over advertising parameters and GATT characteristics. | **Decisive factor for MeshAid**. Without robust GATT Server support, nodes cannot accept incoming bundle writes from scanning peers. |
| **BLE GATT Client (Central Mode)** | **Good**<br>Central scanning and connection are mature in Flutter plugins. | **Native & Complete**<br>Direct access to `BluetoothLeScanner`, `ScanCallback`, `BluetoothGatt`, and MTU negotiation (`requestMtu(512)`). | Native avoids cross-isolate platform channel serialization overhead during large packet streams. |
| **Android Background & Permissions** | **High Friction**<br>Requires third-party wrappers (`flutter_background_service`) that frequently break across Android 12, 13, and 14 permission changes (`BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`). | **Direct & Idiomatic**<br>Android Foreground Services, `WorkManager`, and battery optimization white-listing (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) are first-class Kotlin implementations. | In emergency scenarios, background stability is non-negotiable. |
| **Wi-Fi Direct (P2P)** | **Near Non-Existent**<br>No production-grade Flutter plugin exists for modern Android `WifiP2pManager`. Implementing it requires writing custom native Java/Kotlin channels anyway. | **Full SDK Support**<br>`WifiP2pManager`, `WifiP2pConfig`, and raw socket streams (`ServerSocket` / `Socket`) are native Android APIs with full documentation. | Future expansion to Wi-Fi Direct would require rewriting the transport layer in Kotlin anyway. |
| **Development & Multi-Device Debugging** | Easy UI prototyping, but debugging hardware BLE lifecycle failures across the Dart isolate boundary adds high complexity. | Direct Logcat, Android Studio Bluetooth Profiler, memory profiler, and ADB multi-device wireless debugging. | Physical device debugging is vastly cleaner in native Android Studio. |
| **Deterministic Simulation** | High barrier to simulating 3-node DTN routing outside mobile devices. | Scaffolding the protocol engine as a modular specification/package allows unit-testing the entire store-carry-forward relay logic in CI on any host. | Enables automated continuous testing of $A \to B \to C$ routing. |

---

## 3. Decision Outcome

### Decision: **Option B — Native Android (Kotlin) for Mobile Node, with a Decoupled Cross-Platform Protocol Engine**

We have chosen **Native Android (Kotlin)** as the primary mobile development stack for MeshAid, supplemented by a **Decoupled TypeScript Protocol Engine** for continuous simulation and backend/dashboard interoperability.

### Rationale:
1. **Technical Reliability over Cross-Platform Convenience**: MeshAid's core identity is a **networking and distributed systems project**, not a simple UI application. Cross-platform abstractions that compromise Bluetooth Low Energy dual-mode stability or background service survival defeat the project's primary technical purpose.
2. **Native Bluetooth API Access**: Native Kotlin guarantees unhindered access to `BluetoothGattServer`, `BluetoothLeAdvertiser`, and MTU negotiation without dependency on unmaintained Flutter plugins.
3. **Decoupled Architecture**: By structuring the core packet format, state machine, deduplication store, and routing algorithms into a standalone, platform-agnostic protocol specification and test suite, the protocol can be validated through automated multi-node simulations before deployment to physical hardware.

---

## 4. Architectural Trade-offs & Mitigations

- **Trade-off: Loss of Instant iOS Support**:
  - *Analysis*: iOS restricts background BLE advertising to a special Apple proprietary overflow area and prohibits dynamic GATT server modifications in the background. Meaningful background multi-hop mesh on iOS is severely limited by Apple sandbox policies.
  - *Mitigation*: The primary demonstration targets Android devices, where open hardware access and foreground services permit genuine opportunistic store-carry-forward.
- **Trade-off: Initial Scaffolding Overhead**:
  - *Analysis*: Setting up modern Android Gradle builds requires JDK 17+ and the Android SDK.
  - *Mitigation*: Scaffolding is decoupled into modular directories (`apps/mobile` for Android, `packages/protocol` for pure protocol and simulation logic, `services/backend` for gateway sync, `apps/dashboard` for the web responder portal). The protocol and simulation tests can build and execute immediately in any environment with Node.js.
