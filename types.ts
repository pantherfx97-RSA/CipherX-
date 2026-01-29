
export enum AppMode {
  NORMAL = 'NORMAL',
  DECOY_ONLY = 'DECOY_ONLY',
  LOCKED = 'LOCKED'
}

export type ContactStatus = 'pending' | 'accepted' | 'ignored' | 'blocked';

export interface SecurityStatus {
  isEmulator: boolean;
  isDebug: boolean;
  isIntegrityOk: boolean;
  lastAudit: number;
  deviceFingerprint: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  avatar: string;
  publicKey: string;
  isDecoyIdentity?: boolean;
  biometricEnabled?: boolean;
  sessionTimeout?: number; // In minutes
  messageExpiration?: number; // In seconds
  isPilotApproved?: boolean;
  deviceFingerprint?: string;
}

export interface UserAuth {
  id: string;
  username: string;
  passwordHash: string;
  realPinHash: string;
  decoyPinHash: string;
  salt: string;
}

export interface ContactRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  status: ContactStatus;
  timestamp: number;
  fingerprint: string;
}

export interface ContactRecord {
  contactId: string;
  status: ContactStatus;
  handshakeFingerprint: string;
  addedAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  decoyContent: string;
  encryptedContent: string; // This will hold encrypted text OR encrypted media
  mediaMimeType?: string;   // Type of attachment if present
  iv: string;
  status: 'sent' | 'delivered' | 'read' | 'revealed' | 'destroyed';
  timestamp: number;
  isOneTime: boolean;
  expiresAt?: number;
  expiration?: number; // Burn timer in seconds
}
