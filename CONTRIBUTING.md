# Contributing to MeshAid

Thank you for your interest in contributing to **MeshAid** under the **ADROIT** Technical Club.

MeshAid is a specialized distributed systems and computer networks project with strict architectural constraints. Please review the following guidelines before contributing.

---

## 🚫 Non-AI Contribution Policy
MeshAid is strictly an **AI-free project** per ADROIT competition rules.
- Pull requests introducing machine learning frameworks, LLM wrappers, computer vision, heuristic neural networks, or AI automations will be **immediately closed**.
- All contributions must rely on fundamental algorithms in networking, distributed state synchronization, and cryptography.

---

## 🌿 Git Branching Strategy
We adhere to a trunk-based feature branching workflow:

- `main`: Protected trunk. Always deployable and tested.
- `feature/<name>`: For new capabilities (e.g., `feature/ble-gatt-server`, `feature/manifest-handshake`).
- `fix/<name>`: For bug fixes (e.g., `fix/ttl-prune-overflow`).
- `docs/<name>`: For architectural updates and protocol specifications.

---

## 📝 Commit Conventions
MeshAid enforces the [Conventional Commits](https://www.conventionalcommits.org/) standard:

- `feat:` A new feature or protocol capability.
- `fix:` A bug fix.
- `docs:` Documentation updates.
- `refactor:` Code refactoring without behavioral alterations.
- `test:` Adding or updating tests.
- `chore:` Tooling, dependency, or build configuration updates.

*Example*:
```
feat(protocol): implement priority-aware bundle queue scheduling
docs(security): document proof-of-work anti-spam parameters
```

---

## 🧪 Testing & Verification Requirements
Every PR must:
1. Ensure all unit and simulation tests pass (`npm test` in `packages/protocol`).
2. Adhere to code formatting and linting rules.
3. Contain no committed secrets, keystores, private keys, or `.env` files.
4. Pass GitHub Actions automated CI.
