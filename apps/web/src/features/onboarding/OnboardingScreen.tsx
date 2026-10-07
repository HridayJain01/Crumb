import { Navigate, useNavigate } from 'react-router';
import { DISCLAIMER } from '@crumb/core';
import { saveProfile, useUser } from '../../data/user';
import { LoadingScreen } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ProfileForm } from './ProfileForm';

export function OnboardingScreen() {
  const { uid, loading, profile } = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  if (loading) return <LoadingScreen />;
  if (profile) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
      <h1 className="text-3xl font-black tracking-tight">Let’s set your targets</h1>
      <p className="mt-1 mb-6 text-[15px] font-semibold text-muted">
        A few basics, about 30 seconds. You can change them anytime.
      </p>
      <ProfileForm
        submitLabel="Start my journal"
        onSubmit={async (p) => {
          await saveProfile(uid, p, true);
          toast({ message: 'All set! Log your first meal whenever you’re ready.' });
          navigate('/', { replace: true });
        }}
      />
      <p className="py-4 text-center text-[12px] font-semibold text-muted">{DISCLAIMER}</p>
    </div>
  );
}
