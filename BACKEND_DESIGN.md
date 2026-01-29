
# CipherX Backend Security Design (v2)

## 1. Firestore Schema Updates

### Collection: `users`
- `id` (string): Unique internal UUID.
- `username` (string): Public handle (unique, case-insensitive).
- `publicKey` (string): X25519/RSA Public Key.
- `deviceId` (string): Hardware binding ID.

### Collection: `userAuth` (Private)
- `id` (string): UID.
- `passwordHash` (string): Scrypt/Argon2/SHA256 hashed password.
- `salt` (string): Random cryptosalt per user.

### Collection: `contacts`
- `userId` (string): Owner ID.
- `list` (sub-collection):
  - `contactId` (document): Empty document representing established trust.

### Collection: `messages`
- `senderId` (string): UID.
- `receiverId` (string): UID.
- `decoyContent` (string): Public decoy text.
- `encryptedContent` (string): E2EE Blob.
- `status` (string): `sent` | `revealed` | `destroyed`.

## 2. Authentication Protocol
- **Username Lookup**: Case-insensitive search on registry.
- **Enumeration Protection**: Failed logins and "User Not Found" return identical generic errors with simulated constant-time delays.
- **No Directory**: The `users` collection is not searchable by partial string. You must know the exact username.

## 3. Communication Enforcement
- **Contact-Only Messaging**: Security rules verify the existence of a document in the sender's `contacts` sub-collection for the `receiverId` before allowing `messages.create`.
- **Zero-Handshake Discovery**: No "Friend Requests". Trust is established by manually entering a known identifier.

## 4. Metadata Protection
- **Contact Isolation**: A user's contact list is only readable by that user. No global graph exposure.
- **Anonymous Messaging**: Messaging documents do not store IP, Device-ID, or User-Agent.
