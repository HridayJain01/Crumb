import { Navigate, Outlet } from 'react-router';
import { UserProvider, useUser } from '../data/user';
import { LoadingScreen } from '../components/ui/States';
import { AppShell } from './AppShell';

/*
 * Everything behind sign-in: Firestore, the data hooks and the main screens. The router
 * loads this as one chunk (prefetched after the first paint), so the welcome screen only
 * needs React, the router and Firebase Auth.
 */

export { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
export { HomeScreen } from '../features/home/HomeScreen';
export { LogScreen } from '../features/log/LogScreen';

export function UserRoot() {
  return (
    <UserProvider>
      <Outlet />
    </UserProvider>
  );
}

export function RequireProfile() {
  const { loading, profile, targets } = useUser();
  if (loading) return <LoadingScreen />;
  if (!profile || !targets) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}
