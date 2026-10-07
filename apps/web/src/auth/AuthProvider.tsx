import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  signInWithGoogle(): Promise<void>;
  continueAsGuest(): Promise<void>;
  /** Turns a guest account into a Google account, keeping all data. */
  linkGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const google = new GoogleAuthProvider();
google.setCustomParameters({ prompt: 'select_account' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async signInWithGoogle() {
        await signInWithPopup(auth, google, browserPopupRedirectResolver);
      },
      async continueAsGuest() {
        await signInAnonymously(auth);
      },
      async linkGoogle() {
        if (!auth.currentUser) return;
        const cred = await linkWithPopup(auth.currentUser, google, browserPopupRedirectResolver);
        setUser(cred.user);
      },
      async signOut() {
        await fbSignOut(auth);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user; only use below the auth guard. */
export function useUid(): string {
  const { user } = useAuth();
  if (!user) throw new Error('No signed-in user');
  return user.uid;
}
