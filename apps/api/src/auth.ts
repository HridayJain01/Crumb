import type { Auth } from 'firebase-admin/auth';

export interface TokenVerifier {
  /** Resolves the Firebase user id for a valid ID token; throws otherwise. */
  verify(idToken: string): Promise<{ uid: string }>;
  deleteUser(uid: string): Promise<void>;
}

export function createFirebaseVerifier(auth: Auth): TokenVerifier {
  return {
    async verify(idToken) {
      const decoded = await auth.verifyIdToken(idToken);
      return { uid: decoded.uid };
    },
    async deleteUser(uid) {
      await auth.deleteUser(uid);
    },
  };
}

/** Test verifier: accepts "test:<uid>" tokens. Never wired up outside tests. */
export function createTestVerifier(): TokenVerifier & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async verify(idToken) {
      if (!idToken.startsWith('test:') || idToken.length < 6) throw new Error('bad token');
      return { uid: idToken.slice(5) };
    },
    async deleteUser(uid) {
      deleted.push(uid);
    },
  };
}
