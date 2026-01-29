
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, getDoc, collection, query, where, 
  getDocs, addDoc, onSnapshot, updateDoc, deleteDoc, 
  Unsubscribe
} from 'firebase/firestore';
import { Message, User, UserAuth, ContactRequest, ContactRecord, AppMode } from '../types.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSy-PLACEHOLDER", 
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "cipherx-app.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "cipherx-app",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "cipherx-app.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:0000:web:0000"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class BackendService {
  private async hashValue(val: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(val + salt);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }

  async login(username: string, password: string, fingerprint: string): Promise<User> {
    const lowerName = username.toLowerCase();
    const authRef = doc(db, 'userAuth', lowerName);
    const authSnap = await getDoc(authRef);

    if (!authSnap.exists()) throw new Error("Identity mismatch.");
    const auth = authSnap.data() as UserAuth;
    
    const hash = await this.hashValue(password, auth.salt);
    if (hash !== auth.passwordHash) throw new Error("Identity mismatch.");
    
    const userRef = doc(db, 'users', auth.id);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Node corrupted.");
    
    const user = userSnap.data() as User;
    if (!user.deviceFingerprint) {
      await updateDoc(userRef, { deviceFingerprint: fingerprint });
    }
    return user;
  }

  async register(username: string, password: string, realPin: string, decoyPin: string, inviteCode: string, fingerprint: string): Promise<User> {
    const lowerName = username.toLowerCase();
    const authRef = doc(db, 'userAuth', lowerName);
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

    await setDoc(doc(db, 'users', uid), newUser);
    await setDoc(authRef, { id: uid, username: lowerName, passwordHash, realPinHash, decoyPinHash, salt });
    return newUser;
  }

  async verifyPin(username: string, pin: string): Promise<AppMode> {
    const authRef = doc(db, 'userAuth', username.toLowerCase());
    const authSnap = await getDoc(authRef);
    if (!authSnap.exists()) throw new Error("Lockdown engaged.");
    const auth = authSnap.data() as UserAuth;
    const hash = await this.hashValue(pin, auth.salt);
    if (hash === auth.realPinHash) return AppMode.NORMAL;
    if (hash === auth.decoyPinHash) return AppMode.DECOY_ONLY;
    throw new Error("Lockdown engaged.");
  }

  async sendContactRequest(senderId: string, receiverUsername: string): Promise<void> {
    const lowerTarget = receiverUsername.toLowerCase();
    const authRef = doc(db, 'userAuth', lowerTarget);
    const authSnap = await getDoc(authRef);
    if (!authSnap.exists()) throw new Error("Node not found.");
    
    const targetUid = authSnap.data().id;
    const senderSnap = await getDoc(doc(db, 'users', senderId));
    const sender = senderSnap.data() as User;

    await addDoc(collection(db, 'requests'), {
      senderId,
      senderUsername: sender.username,
      receiverId: targetUid,
      status: 'pending',
      timestamp: Date.now(),
      fingerprint: "HS-" + Math.random().toString(16).slice(2, 6).toUpperCase()
    });
  }

  subscribeRequests(userId: string, callback: (requests: ContactRequest[]) => void): Unsubscribe {
    const q = query(collection(db, 'requests'), where('receiverId', '==', userId), where('status', '==', 'pending'));
    return onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContactRequest));
      callback(requests);
    });
  }

  async respondToRequest(requestId: string, userId: string, status: 'accepted' | 'ignored'): Promise<void> {
    const reqRef = doc(db, 'requests', requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return;
    const req = reqSnap.data() as ContactRequest;

    if (status === 'accepted') {
      const record = { status: 'accepted', handshakeFingerprint: req.fingerprint, addedAt: Date.now() };
      await setDoc(doc(db, 'contacts', req.senderId, 'list', req.receiverId), record);
      await setDoc(doc(db, 'contacts', req.receiverId, 'list', req.senderId), record);
    }
    await deleteDoc(reqRef);
  }

  async getContacts(userId: string): Promise<{user: User, record: ContactRecord}[]> {
    const listSnap = await getDocs(collection(db, 'contacts', userId, 'list'));
    const contacts = await Promise.all(listSnap.docs.map(async (d) => {
      const userSnap = await getDoc(doc(db, 'users', d.id));
      return {
        user: userSnap.data() as User,
        record: { contactId: d.id, ...d.data() } as ContactRecord
      };
    }));
    return contacts.filter(c => c.user);
  }

  async sendMessage(msg: Message, keyJwk: any): Promise<void> {
    await setDoc(doc(db, 'messages', msg.id), msg);
    await setDoc(doc(db, 'messageKeys', msg.id), { key: keyJwk, receiverId: msg.receiverId });
  }

  subscribeMessages(currentUserId: string, targetUserId: string, callback: (msgs: Message[]) => void): Unsubscribe {
    const q = query(collection(db, 'messages'));
    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map(d => d.data() as Message)
        .filter(m => (m.senderId === currentUserId && m.receiverId === targetUserId) || (m.senderId === targetUserId && m.receiverId === currentUserId))
        .sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
    });
  }

  async getMessageKey(messageId: string): Promise<any> {
    const snap = await getDoc(doc(db, 'messageKeys', messageId));
    return snap.exists() ? snap.data().key : null;
  }

  async updateMessageStatus(messageId: string, newStatus: 'revealed' | 'destroyed'): Promise<void> {
    const msgRef = doc(db, 'messages', messageId);
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
        await deleteDoc(doc(db, 'messageKeys', messageId));
      }, (msg.expiration || 15) * 1000);
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const snap = await getDoc(doc(db, 'users', id));
    return snap.exists() ? snap.data() as User : null;
  }
}

export const backend = new BackendService();
