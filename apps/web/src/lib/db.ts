import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { emulatorHost, firebaseApp, usingEmulators } from './firebase';

/*
 * Firestore is the client data layer, with a persistent local cache so the app opens
 * instantly, works offline and queues writes until it reconnects.
 */
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

if (usingEmulators) connectFirestoreEmulator(db, emulatorHost, 8080);
