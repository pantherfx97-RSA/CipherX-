
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, getDoc, collection, query, where, 
  getDocs, addDoc, onSnapshot, updateDoc, deleteDoc, 
  Unsubscribe, Firestore
} from 'firebase/firestore';
import { Message, User, UserAuth, ContactRequest, ContactRecord, AppMode } from '../types.js';

// Safe access to environment variables or hardcoded fallback
const getEnv = (key: string, fallback: string): string => {
  try {
    const val = (window as any).process?.env?.[key];
    if (val && val !== `VITE_FIREBASE_${key.split('_').pop()}` && val !== "AIzaSy-PLACEHOLDER") {
        return val;
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyAj8KDrTlejMWJUEsSefOAxRRpNv3DuaQc"), 
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "cipherx-a82b4.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "cipherx-a82b4"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "cipherx-a82b4.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "542292695754"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:542292695754:web:ca9dd9f8ab596d725f3233")
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
export let isBackendReady = false;

try {
  // Use existing app if already initialized, otherwise create new one
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  
  if (app) {
    db = getFirestore(app);
    isBackendReady = !!db;
  }
} catch (error) {
  console.error("CipherX: Failed to initialize Firebase:", error);
}

class BackendService {
  private async hashValue(val: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(val + salt);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }

  private ensureDb(): Firestore {
    if (!db) {
      // Attempt to recover if db is somehow not initialized
      try {
        const currentApp = getApp();
        db = getFirestore(currentApp);
      } catch (e) {
        throw new Error("Secure Node Offline: Database connection could not be established.");
      }
    }
    return db!;
  }

  async login(username: string, password: string, fingerprint: string): Promise<User> {
    const firestore = this.ensureDb();
    const lowerName = username.toLowerCase();
    const authRef = doc(firestore, 'userAuth', lowerName);
    const authSnap = await getDoc(authRef);

    if (!authSnap.exists()) throw new Error("Identity mismatch.");
    const auth = authSnap.data() as UserAuth;
    
    const hash = await this.hashValue(password, auth.salt);
    if (hash !== auth.passwordHash) throw new Error("Identity mismatch.");
    
    const userRef = doc(firestore, 'users', auth.id);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Node corrupted.");
    
    const user = userSnap.data() as User;
    if (!user.deviceFingerprint) {
      await updateDoc(userRef, { deviceFingerprint: fingerprint });
    }
    return user;
  }

  async register(username: string, password: string, realPin: string, decoyPin: string, inviteCode: string, fingerprint: string): Promise<User> {
    const firestore = this.ensureDb();
    const lowerName = username.toLowerCase();
    const authRef = doc(firestore, 'userAuth', lowerName);
    const authSnap = await getDoc(authRef);
    if (authSnap.exists()) throw new Error("Identity already claimed.");

    const uid = `u_${Math.random().toString(36).slice(2, 9)}`;
    const salt = window.crypto.randomUUID();
    const [passwordHash, realPinHash, decoyPinHash] = await Promise.all([
      this.hashValue(password, salt),
      this.hashValue(realPin, salt),
      this.hashValue(decoyPin, salt)
    ]);

    const newUser: User = {
      id: uid,
      username: lowerName,
      name: username,
      avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${uid}`,
      publicKey: `key_${uid}`,
      sessionTimeout: 5,
      messageExpiration: 15,
      isPilotApproved: true,
      deviceFingerprint: fingerprint
    };

    await setDoc(doc(firestore, 'users', uid), newUser);
    await setDoc(authRef, { id: uid, username: lowerName, passwordHash, realPinHash, decoyPinHash, salt });
    return newUser;
  }

  async verifyPin(username: string, pin: string): Promise<AppMode> {
    const firestore = this.ensureDb();
    const authRef = doc(firestore, 'userAuth', username.toLowerCase());
    const authSnap = await getDoc(authRef);
    if (!authSnap.exists()) throw new Error("Lockdown engaged.");
    const auth = authSnap.data() as UserAuth;
    const hash = await this.hashValue(pin, auth.salt);
    if (hash === auth.realPinHash) return AppMode.NORMAL;
    if (hash === auth.decoyPinHash) return AppMode.DECOY_ONLY;
    throw new Error("Lockdown engaged.");
  }

  async sendContactRequest(senderId: string, receiverUsername: string): Promise<void> {
    const firestore = this.ensureDb();
    const lowerTarget = receiverUsername.toLowerCase();
    const authRef = doc(firestore, 'userAuth', lowerTarget);
    const authSnap = await getDoc(authRef);
    if (!authSnap.exists()) throw new Error("Node not found.");
    
    const targetUid = authSnap.data().id;
    const senderSnap = await getDoc(doc(firestore, 'users', senderId));
    const sender = senderSnap.data() as User;

    await addDoc(collection(firestore, 'requests'), {
      senderId,
      senderUsername: sender.username,
      receiverId: targetUid,
      status: 'pending',
      timestamp: Date.now(),
      fingerprint: "HS-" + Math.random().toString(16).slice(2, 6).toUpperCase()
    });
  }

  subscribeRequests(userId: string, callback: (requests: ContactRequest[]) => void): Unsubscribe {
    const firestore = this.ensureDb();
    const q = query(collection(firestore, 'requests'), where('receiverId', '==', userId), where('status', '==', 'pending'));
    return onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContactRequest));
      callback(requests);
    });
  }

  async respondToRequest(requestId: string, userId: string, status: 'accepted' | 'ignored'): Promise<void> {
    const firestore = this.ensureDb();
    const reqRef = doc(firestore, 'requests', requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return;
    const req = reqSnap.data() as ContactRequest;

    if (status === 'accepted') {
      const record = { status: 'accepted', handshakeFingerprint: req.fingerprint, addedAt: Date.now() };
      await setDoc(doc(firestore, 'contacts', req.senderId, 'list', req.receiverId), record);
      await setDoc(doc(firestore, 'contacts', req.receiverId, 'list', req.senderId), record);
    }
    await deleteDoc(reqRef);
  }

  async getContacts(userId: string): Promise<{user: User, record: ContactRecord}[]> {
    const firestore = this.ensureDb();
    const listSnap = await getDocs(collection(firestore, 'contacts', userId, 'list'));
    const contacts = await Promise.all(listSnap.docs.map(async (d) => {
      const userSnap = await getDoc(doc(firestore, 'users', d.id));
      return {
        user: userSnap.data() as User,
        record: { contactId: d.id, ...d.data() } as ContactRecord
      };
    }));
    return contacts.filter(c => c.user);
  }

  async sendMessage(msg: Message, keyJwk: any): Promise<void> {
    const firestore = this.ensureDb();
    await setDoc(doc(firestore, 'messages', msg.id), msg);
    await setDoc(doc(firestore, 'messageKeys', msg.id), { key: keyJwk, receiverId: msg.receiverId });
  }

  subscribeMessages(currentUserId: string, targetUserId: string, callback: (msgs: Message[]) => void): Unsubscribe {
    const firestore = this.ensureDb();
    const q = query(collection(firestore, 'messages'));
    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map(d => d.data() as Message)
        .filter(m => (m.senderId === currentUserId && m.receiverId === targetUserId) || (m.senderId === targetUserId && m.receiverId === currentUserId))
        .sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
    });
  }

  async getMessageKey(messageId: string): Promise<any> {
    const firestore = this.ensureDb();
    const snap = await getDoc(doc(firestore, 'messageKeys', messageId));
    return snap.exists() ? snap.data().key : null;
  }

  async updateMessageStatus(messageId: string, newStatus: 'revealed' | 'destroyed'): Promise<void> {
    const firestore = this.ensureDb();
    const msgRef = doc(firestore, 'messages', messageId);
    await updateDoc(msgRef, { status: newStatus });
    
    if (newStatus === 'revealed') {
      const msgSnap = await getDoc(msgRef);
      const msg = msgSnap.data() as Message;
      setTimeout(async () => {
        await updateDoc(msgRef, {
          encryptedContent: "[PURGED]",
          iv: "",
          status: 'destroyed',
          mediaMimeType: null
        });
        await deleteDoc(doc(firestore, 'messageKeys', messageId));
      }, (msg.expiration || 15) * 1000);
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const firestore = this.ensureDb();
    const snap = await getDoc(doc(firestore, 'users', id));
    return snap.exists() ? snap.data() as User : null;
  }
}

export const backend = new BackendService();
