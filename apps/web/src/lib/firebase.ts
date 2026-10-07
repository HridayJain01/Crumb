import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';

/*
 * Firebase app + Auth: the only Firebase code the first screen needs. Firestore lives in
 * ./db and loads with the signed-in part of the app, which keeps the first paint light.
 */

const env = import.meta.env;
export const usingEmulators = env.VITE_USE_EMULATORS === 'true';
/** Emulators are reached on whichever host serves the app (localhost or 127.0.0.1). */
export const emulatorHost = window.location.hostname || '127.0.0.1';

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

// No popup/redirect resolver at start-up: Google's helper script loads only when the user
// actually signs in with Google (faster cold start, fewer third-party requests).
export const auth = initializeAuth(firebaseApp, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

if (usingEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
}
