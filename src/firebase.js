import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, onValue, update as dbUpdate } from 'firebase/database';

// ==========================================================
// 👇 แก้ตรงนี้: วางค่า config จาก Firebase Console ของคุณ
// ==========================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};
// ==========================================================

const isFirebaseConfigured = () => {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('YOUR_')) return false;
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes('YOUR_')) return false;
  if (!firebaseConfig.databaseURL || firebaseConfig.databaseURL.includes('YOUR_')) return false;
  return true;
};

// แปลง "mindlink:room:ABCD" → "mindlink/room/ABCD" (Firebase path)
function keyToPath(key) {
  return key.replace(/:/g, '/');
}

function normalizeKey(key) {
  return key;
}

let storage;

if (isFirebaseConfigured()) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  storage = {
    async get(key) {
      try {
        const snapshot = await get(ref(db, keyToPath(key)));
        if (!snapshot.exists()) return null;
        return { value: snapshot.val(), key };
      } catch (e) {
        console.error('storage.get error:', e);
        return null;
      }
    },

    async set(key, value) {
      try {
        await set(ref(db, keyToPath(key)), value);
        return { value, key };
      } catch (e) {
        console.error('storage.set error:', e);
        throw e;
      }
    },

    async update(key, patch) {
      try {
        await dbUpdate(ref(db, keyToPath(key)), patch);
        return { key, patch };
      } catch (e) {
        console.error('storage.update error:', e);
        throw e;
      }
    },

    /**
     * Subscribe to realtime updates (แทน polling)
     * Returns an unsubscribe function.
     */
    subscribe(key, callback) {
      return onValue(ref(db, keyToPath(key)), (snapshot) => {
        if (snapshot.exists()) {
          callback({ value: snapshot.val(), key });
        } else {
          callback(null);
        }
      });
    },
  };

} else {
  console.warn('Firebase config not set. Using localStorage fallback for room state.');
  const localSubscribers = new Map();

  const notifySubscribers = (key, payload) => {
    const setCallbacks = localSubscribers.get(key);
    if (setCallbacks) {
      setCallbacks.forEach((cb) => cb(payload));
    }
  };

  const handleStorageEvent = (event) => {
    if (!event.key) return;
    const payload = event.newValue ? { value: event.newValue, key: event.key } : null;
    notifySubscribers(event.key, payload);
  };

  const handleCustomEvent = (event) => {
    const { key, value } = event.detail || {};
    if (!key) return;
    notifySubscribers(key, value ? { value, key } : null);
  };

  window.addEventListener('storage', handleStorageEvent);
  window.addEventListener('local-storage-changed', handleCustomEvent);

  storage = {
    async get(key) {
      try {
        const item = window.localStorage.getItem(normalizeKey(key));
        return item ? { value: item, key } : null;
      } catch (e) {
        console.error('localStorage.get error:', e);
        return null;
      }
    },

    async set(key, value) {
      try {
        const storeValue = typeof value === 'string' ? value : JSON.stringify(value);
        window.localStorage.setItem(normalizeKey(key), storeValue);
        const payload = { value: storeValue, key };
        notifySubscribers(key, payload);
        window.dispatchEvent(new CustomEvent('local-storage-changed', { detail: payload }));
        return { value: storeValue, key };
      } catch (e) {
        console.error('localStorage.set error:', e);
        throw e;
      }
    },

    async update(key, patch) {
      try {
        const normalizedKey = normalizeKey(key);
        const existing = window.localStorage.getItem(normalizedKey);
        const obj = existing ? JSON.parse(existing) : {};
        const merged = { ...obj, ...patch };
        const storeValue = JSON.stringify(merged);
        window.localStorage.setItem(normalizedKey, storeValue);
        const payload = { value: storeValue, key: normalizedKey };
        notifySubscribers(normalizedKey, payload);
        window.dispatchEvent(new CustomEvent('local-storage-changed', { detail: payload }));
        return { value: storeValue, key: normalizedKey };
      } catch (e) {
        console.error('localStorage.update error:', e);
        throw e;
      }
    },

    subscribe(key, callback) {
      const normalizedKey = normalizeKey(key);
      if (!localSubscribers.has(normalizedKey)) {
        localSubscribers.set(normalizedKey, new Set());
      }
      localSubscribers.get(normalizedKey).add(callback);

      const current = window.localStorage.getItem(normalizedKey);
      callback(current ? { value: current, key: normalizedKey } : null);

      return () => {
        const setCallbacks = localSubscribers.get(normalizedKey);
        if (!setCallbacks) return;
        setCallbacks.delete(callback);
        if (setCallbacks.size === 0) {
          localSubscribers.delete(normalizedKey);
        }
      };
    },
  };
}

export { storage };
