import { setDoc } from 'firebase/firestore';
import { createContext, useContext, type ReactNode } from 'react';
import { computeTargets, type Profile, type Targets } from '@crumb/core';
import { useUid } from '../auth/AuthProvider';
import { refs, useLiveDoc } from './hooks';

export interface UserDoc {
  profile?: Profile;
  targets?: Targets;
  settings?: { onboardedAt?: string };
  createdAt?: string;
  updatedAt?: string;
}

interface UserState {
  uid: string;
  loading: boolean;
  profile: Profile | undefined;
  targets: Targets | undefined;
}

const UserContext = createContext<UserState | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const uid = useUid();
  const { data, loading } = useLiveDoc<UserDoc>(refs.user(uid), {});
  return (
    <UserContext.Provider value={{ uid, loading, profile: data.profile, targets: data.targets }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserState {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside UserProvider');
  return ctx;
}

/** Profile + targets are only needed below the onboarding guard, where they always exist. */
export function useProfile(): { uid: string; profile: Profile; targets: Targets } {
  const { uid, profile, targets } = useUser();
  if (!profile || !targets) throw new Error('Profile not set up');
  return { uid, profile, targets };
}

/**
 * Saves the profile and its deterministic targets together (targets are never AI-made).
 * Resolves as soon as the write is in the local cache, so it also works offline.
 */
export async function saveProfile(uid: string, profile: Profile, isNew: boolean): Promise<Targets> {
  const targets = computeTargets(profile);
  const now = new Date().toISOString();
  void setDoc(
    refs.user(uid),
    {
      profile,
      targets,
      updatedAt: now,
      ...(isNew ? { createdAt: now, settings: { onboardedAt: now } } : {}),
    },
    { merge: true },
  ).catch((err) => console.warn('Profile save failed', err));
  return targets;
}
