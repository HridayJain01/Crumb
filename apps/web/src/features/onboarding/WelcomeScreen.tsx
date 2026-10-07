import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Camera, Compass, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Mascot } from '../../components/ui/Mascot';
import { useToast } from '../../components/ui/Toast';
import { auth, usingEmulators } from '../../lib/firebase';
import { prefetchSignedIn } from '../../app/lazy';
import { DISCLAIMER } from '@crumb/core';

const POINTS = [
  {
    icon: Camera,
    title: 'Snap, say or type it',
    body: 'A photo or one sentence is enough. No food searching.',
  },
  {
    icon: Sparkles,
    title: 'We do the structuring',
    body: 'Calories, protein, carbs and fat — as honest estimates.',
  },
  {
    icon: Compass,
    title: 'One useful next step',
    body: 'Simple, goal-aware suggestions. No guilt.',
  },
];

export function WelcomeScreen() {
  const { signInWithGoogle, continueAsGuest } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<'google' | 'guest' | 'sample' | null>(null);

  // The screens behind sign-in download once this screen is up (or as soon as a sign-in
  // button is touched), so they never slow the first paint and are ready after sign-in.
  useEffect(() => {
    const timer = window.setTimeout(prefetchSignedIn, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  async function run(kind: 'google' | 'guest' | 'sample') {
    setBusy(kind);
    try {
      if (kind === 'google') await signInWithGoogle();
      else if (kind === 'sample') {
        // Local emulators only: the account created by `pnpm seed:demo`.
        await signInWithEmailAndPassword(auth, 'sample@crumb.test', 'crumb-sample');
      } else await continueAsGuest();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (kind === 'sample') {
        toast({ message: 'Run “pnpm seed:demo” first to create it.', tone: 'warning' });
      } else if (!code.includes('popup-closed') && !code.includes('cancelled-popup')) {
        toast({ message: 'Couldn’t sign in. Please try again.', tone: 'warning' });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-8">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Mascot size={128} className="animate-pop" />
        <h1 className="mt-4 text-4xl font-black tracking-tight">Crumb</h1>
        <p className="mt-2 max-w-xs text-lg font-bold text-muted">
          Show us what you eat. We’ll turn it into a picture of your day.
        </p>
        <ul className="mt-8 w-full space-y-3 text-left">
          {POINTS.map((p) => (
            <li
              key={p.title}
              className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-card"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink">
                <p.icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-extrabold">{p.title}</span>
                <span className="block text-[14px] font-semibold text-muted">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div
        className="mt-8 space-y-3"
        onPointerDown={prefetchSignedIn}
        onFocusCapture={prefetchSignedIn}
      >
        <Button
          size="lg"
          block
          loading={busy === 'google'}
          disabled={busy !== null}
          onClick={() => run('google')}
        >
          Continue with Google
        </Button>
        <Button
          size="lg"
          variant="ghost"
          block
          loading={busy === 'guest'}
          disabled={busy !== null}
          onClick={() => run('guest')}
        >
          Try it first — no account
        </Button>
        {usingEmulators && (
          <Button
            size="sm"
            variant="ghost"
            block
            loading={busy === 'sample'}
            disabled={busy !== null}
            onClick={() => run('sample')}
          >
            Sample account (local emulators only)
          </Button>
        )}
        <p className="pt-2 text-center text-[12px] font-semibold text-muted">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
