
/**
 * CipherX Hardened Cryptography Module
 */

export const generateMessageKey = async (): Promise<CryptoKey> => {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

export const encryptMessage = async (plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
    iv: btoa(String.fromCharCode(...iv))
  };
};

export const decryptMessage = async (ciphertext: string, iv: string, key: CryptoKey): Promise<string> => {
  const decoder = new TextDecoder();
  const encryptedData = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const ivData = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivData },
    key,
    encryptedData
  );

  return decoder.decode(decryptedBuffer);
};

/**
 * Persist keys to IndexedDB so they survive refresh on this device ONLY.
 */
export const storeLocalKey = async (msgId: string, key: CryptoKey): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cipherx_keys', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(key, msgId);
      tx.oncomplete = () => resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const getLocalKey = async (msgId: string): Promise<CryptoKey | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cipherx_keys', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('keys')) return resolve(null);
      const tx = db.transaction('keys', 'readonly');
      const req = tx.objectStore('keys').get(msgId);
      req.onsuccess = () => resolve(req.result || null);
    };
    request.onerror = () => reject(request.error);
  });
};

export const zeroMemory = (obj: any) => {
  if (!obj) return;
  if (Array.isArray(obj)) {
    obj.fill(0);
  } else {
    Object.keys(obj).forEach(key => {
      obj[key] = null;
      delete obj[key];
    });
  }
};
