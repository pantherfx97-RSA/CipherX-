
# CipherX Security Audit & MVP Readiness Report

## 1. Cryptography Audit
- **Protocol**: AES-GCM (256-bit) via Web Crypto API.
- **Key Management**: Per-message ephemeral keys. Keys are generated on the sender's device, used to encrypt, and the `CryptoKey` object is stored in an in-memory `EPHEMERAL_KEYS` registry.
- **Forward Secrecy**: Achieved. Compromise of one message key does not reveal others as keys are unique per payload.
- **Zero-Knowledge**: Verified. Plaintext never leaves the device. The backend (Firestore) only sees `encryptedContent`, `iv`, and harmless `decoyContent`.

## 2. One-Time Reveal & Plausible Deniability
- **Logic**: Upon reveal, the recipient uses the local `EPHEMERAL_KEYS` entry. Immediately after decryption, the key is deleted from the map and the backend status is updated to `revealed`.
- **Destruction**: A simulated Cloud Function scrubs the encrypted payload from the database 30 seconds after the `revealed` status is set.
- **Fake PIN (`0000`)**: Corrected behavior ensures no real messages are even queried from the backend when in Decoy Identity mode.

## 3. Integrity & Anti-Tamper
- **Heuristics**: Browser-based emulator detection (UA strings, hardware concurrency) and debugger detection (viewport vs window size deltas).
- **Fallback**: Any integrity failure silently forces `AppMode.DECOY_ONLY`, showing a "safe" guest environment.
- **Session Locking**: App locks and wipes memory on visibility change (backgrounding) or 5-minute inactivity.

## 4. Metadata Minimization
- **Timestamps**: Stored for sorting but not linked to user identities in a global index.
- **Payloads**: The `decoyContent` is the only "readable" part of the message document for an admin.

## 5. MVP Readiness Checklist
- [x] E2EE Chat Flow
- [x] AI Decoy Generator (Gemini Integration)
- [x] One-Time Reveal Destruction
- [x] Panic Mode / Fake PIN
- [x] Integrity Auditing
- [x] Session Auto-Lock
- [x] Device Fingerprinting

## 6. Assumptions & Limitations
- **Assumption**: User keeps their real PIN secret.
- **Assumption**: The device's browser/OS itself is not compromised (e.g., no keyloggers at the OS level).
- **Limitation**: CipherX does not protect against physical coercion where the attacker knows about the Dual-Identity feature, though it provides plausible deniability.
- **Limitation**: Web-based E2EE is susceptible to malicious script injection if the hosting provider (Firebase Hosting) is compromised.
