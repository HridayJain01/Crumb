import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { UserProvider, useUser } from '../data/user';
import { LoadingScreen } from '../components/ui/States';
import { AppShell } from './AppShell';
import { WelcomeScreen } from '../features/onboarding/WelcomeScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { LogScreen } from '../features/log/LogScreen';

const InsightsScreen = lazy(() => import('../features/insights/InsightsScreen'));
const ProfileScreen = lazy(() => import('../features/profile/ProfileScreen'));

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/welcome" replace />;
  return (
    <UserProvider>
      <Outlet />
    </UserProvider>
  );
}

function RequireProfile() {
  const { loading, profile, targets } = useUser();
  if (loading) return <LoadingScreen />;
  if (!profile || !targets) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/welcome',
    element: (
      <PublicOnly>
        <WelcomeScreen />
      </PublicOnly>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding', element: <OnboardingScreen /> },
      {
        element: <RequireProfile />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: 'log', element: <LogScreen /> },
          {
            path: 'insights',
            element: (
              <Lazy>
                <InsightsScreen />
              </Lazy>
            ),
          },
          {
            path: 'profile',
            element: (
              <Lazy>
                <ProfileScreen />
              </Lazy>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
