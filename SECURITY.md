# Security Policy

## 1. Supported Versions
MeshAid is currently in active pre-alpha development under ADROIT. Only the latest commit on `main` receives security patches.

| Version / Branch | Supported |
| :--- | :--- |
| `main` (v0.1-draft) | :white_check_mark: |
| Legacy releases | :x: |

---

## 2. Reporting a Vulnerability
Security vulnerabilities in the MeshAid protocol, BLE handling, cryptographic implementation, or gateway service should be reported responsibly.

- Please do **not** open a public issue for zero-day vulnerabilities or security exploits.
- Contact the technical leads privately via GitHub Security Advisories on the repository or email the maintainer.
- Include detailed reproduction steps, packet traces (if applicable), and affected component versions.
- We commit to acknowledging receipt within 48 hours and providing an evaluation within 7 days.

---

## 3. Cryptographic Ground Rules
1. **Never Invent Cryptography**: All security primitives must use audited, standardized implementations (e.g., Ed25519, SHA-256, AES-256-GCM / ChaCha20-Poly1305). Custom rolling ciphers or hashes are prohibited.
2. **Zero Secrets in Repository**: No private keys, signing keystores (`.jks`, `.keystore`), `.env` files, or cloud credentials may ever be committed to source control.
