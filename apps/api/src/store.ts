import type { ActivityWithId } from '@crumb/core';
import type { Firestore } from 'firebase-admin/firestore';

/*
 * Server-side persistence. The client writes user data directly (rules: owner-only); the
 * server only touches what clients must not: counters, OAuth tokens, synced activities,
 * and full account deletion.
 */
export interface ServerStore {
  /** Increments a daily counter if it is below `limit`. Returns false when the limit is hit. */
  consume(key: string, limit: number): Promise<boolean>;
  getSealedToken(uid: string, provider: string): Promise<string | null>;
  putSealedToken(uid: string, provider: string, sealed: string): Promise<void>;
  deleteSealedToken(uid: string, provider: string): Promise<void>;
  setIntegration(
    uid: string,
    provider: string,
    data: { connected: boolean; lastSyncAt?: string },
  ): Promise<void>;
  upsertActivities(uid: string, activities: ActivityWithId[]): Promise<void>;
  deleteUserData(uid: string): Promise<void>;
}

export function createFirestoreStore(db: Firestore): ServerStore {
  return {
    async consume(key, limit) {
      const ref = db.collection('rateLimits').doc(key);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const count = (snap.get('count') as number | undefined) ?? 0;
        if (count >= limit) return false;
        // expireAt lets a Firestore TTL policy clean these up automatically.
        tx.set(
          ref,
          { count: count + 1, expireAt: new Date(Date.now() + 3 * 86_400_000) },
          { merge: true },
        );
        return true;
      });
    },
    async getSealedToken(uid, provider) {
      const snap = await db.doc(`private/${uid}/tokens/${provider}`).get();
      return (snap.get('sealed') as string | undefined) ?? null;
    },
    async putSealedToken(uid, provider, sealed) {
      await db
        .doc(`private/${uid}/tokens/${provider}`)
        .set({ sealed, updatedAt: new Date().toISOString() });
    },
    async deleteSealedToken(uid, provider) {
      await db.doc(`private/${uid}/tokens/${provider}`).delete();
    },
    async setIntegration(uid, provider, data) {
      await db
        .doc(`users/${uid}/integrations/${provider}`)
        .set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
    },
    async upsertActivities(uid, activities) {
      const batch = db.batch();
      for (const { id, ...activity } of activities) {
        batch.set(db.doc(`users/${uid}/activities/${id}`), activity);
      }
      await batch.commit();
    },
    async deleteUserData(uid) {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await db.recursiveDelete(db.doc(`private/${uid}`));
    },
  };
}

/** In-memory store for tests and offline demos. */
export function createMemoryStore(): ServerStore & { dump(): Record<string, unknown> } {
  const counters = new Map<string, number>();
  const tokens = new Map<string, string>();
  const integrations = new Map<string, unknown>();
  const activities = new Map<string, ActivityWithId>();
  return {
    async consume(key, limit) {
      const n = counters.get(key) ?? 0;
      if (n >= limit) return false;
      counters.set(key, n + 1);
      return true;
    },
    async getSealedToken(uid, provider) {
      return tokens.get(`${uid}/${provider}`) ?? null;
    },
    async putSealedToken(uid, provider, sealed) {
      tokens.set(`${uid}/${provider}`, sealed);
    },
    async deleteSealedToken(uid, provider) {
      tokens.delete(`${uid}/${provider}`);
    },
    async setIntegration(uid, provider, data) {
      integrations.set(`${uid}/${provider}`, data);
    },
    async upsertActivities(uid, list) {
      for (const a of list) activities.set(`${uid}/${a.id}`, a);
    },
    async deleteUserData(uid) {
      for (const map of [tokens, integrations, activities] as Map<string, unknown>[]) {
        for (const k of [...map.keys()]) if (k.startsWith(`${uid}/`)) map.delete(k);
      }
    },
    dump() {
      return {
        counters: Object.fromEntries(counters),
        tokens: Object.fromEntries(tokens),
        integrations: Object.fromEntries(integrations),
        activities: Object.fromEntries(activities),
      };
    },
  };
}
