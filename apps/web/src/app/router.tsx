import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { LoadingScreen } from '../components/ui/States';
import { WelcomeScreen } from '../features/onboarding/WelcomeScreen';
import { loadSignedIn } from './lazy';

// One chunk for everything behind sign-in; Insights and Profile are chunks of their own.
const UserRoot = lazy(() => loadSignedIn().then((m) => ({ default: m.UserRoot })));
const RequireProfile = lazy(() => loadSignedIn().then((m) => ({ default: m.RequireProfile })));
const OnboardingScreen = lazy(() => loadSignedIn().then((m) => ({ default: m.OnboardingScreen })));
const HomeScreen = lazy(() => loadSignedIn().then((m) => ({ default: m.HomeScreen })));
const LogScreen = lazy(() => loadSignedIn().then((m) => ({ default: m.LogScreen })));
const InsightsScreen = lazy(() => import('../features/insights/InsightsScreen'));
const ProfileScreen = lazy(() => import('../features/profile/ProfileScreen'));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/welcome" replace />;
  return (
    <Lazy>
      <UserRoot />
    </Lazy>
  );
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
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
      {
        path: '/onboarding',
        element: (
          <Lazy>
            <OnboardingScreen />
          </Lazy>
        ),
      },
      {
        element: (
          <Lazy>
            <RequireProfile />
          </Lazy>
        ),
        children: [
          {
            index: true,
            element: (
              <Lazy>
                <HomeScreen />
              </Lazy>
            ),
          },
          {
            path: 'log',
            element: (
              <Lazy>
                <LogScreen />
              </Lazy>
            ),
          },
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
