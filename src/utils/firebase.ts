// src/utils/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, off } from 'firebase/database';

// These can be configured by the user later.
// We provide fallback to local event system if Firebase credentials aren't provided.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

let db: any = null;
let isFirebaseEnabled = false;

if (firebaseConfig.apiKey && firebaseConfig.databaseURL) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getDatabase(app);
    isFirebaseEnabled = true;
    console.log("Firebase initialized successfully for caching/temp storage.");
  } catch (error) {
    console.warn("Failed to initialize Firebase. Falling back to local state.", error);
  }
} else {
  console.info("Firebase config not fully provided. Visual execution states will fallback to local in-memory emitter.");
}

// In-memory fallback emitter
class LocalEmitter {
  private listeners: Map<string, Array<(val: any) => void>> = new Map();

  on(path: string, callback: (val: any) => void) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, []);
    }
    this.listeners.get(path)!.push(callback);
  }

  off(path: string, callback?: (val: any) => void) {
    if (!callback) {
      this.listeners.delete(path);
      return;
    }
    const list = this.listeners.get(path);
    if (list) {
      this.listeners.set(path, list.filter(cb => cb !== callback));
    }
  }

  set(path: string, val: any) {
    const list = this.listeners.get(path);
    if (list) {
      list.forEach(cb => cb(val));
    }
  }
}

const localEmitter = new LocalEmitter();

export const cacheService = {
  isRealtime(): boolean {
    return isFirebaseEnabled;
  },

  // Set running state for an agent
  // e.g. cacheService.setRunningState("conv_123", "agent_A", "executing")
  async setRunningState(conversationId: string, agentId: string | null, status: 'idle' | 'executing' | 'done') {
    const path = `conversations/${conversationId}/runningState`;
    const payload = { agentId, status, timestamp: Date.now() };

    if (isFirebaseEnabled && db) {
      try {
        await set(ref(db, path), payload);
      } catch (e) {
        console.error("Firebase write error:", e);
        localEmitter.set(path, payload);
      }
    } else {
      localEmitter.set(path, payload);
    }
  },

  // Listen to running state
  subscribeToRunningState(conversationId: string, callback: (data: { agentId: string | null; status: 'idle' | 'executing' | 'done' }) => void) {
    const path = `conversations/${conversationId}/runningState`;

    if (isFirebaseEnabled && db) {
      const dbRef = ref(db, path);
      const listener = (snapshot: any) => {
        const val = snapshot.val();
        if (val) {
          callback(val);
        } else {
          callback({ agentId: null, status: 'idle' });
        }
      };
      onValue(dbRef, listener);
      return () => off(dbRef, 'value', listener);
    } else {
      const wrapper = (val: any) => {
        if (val) callback(val);
      };
      localEmitter.on(path, wrapper);
      return () => localEmitter.off(path, wrapper);
    }
  }
};
