import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { collection, getDoc, getDocs } from 'firebase/firestore';
import { ChevronDown, Download, LogOut, Shield, Trash2, Watch } from 'lucide-react';
import { addDays, DISCLAIMER } from '@crumb/core';
import { useAuth } from '../../auth/AuthProvider';
import { saveProfile, useProfile } from '../../data/user';
import { refs, useLiveDoc } from '../../data/hooks';
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { Sheet } from '../../components/ui/Sheet';
import { api, ApiError } from '../../lib/api';
import { deviceTimeZone, todayKey } from '../../lib/time';
import { ProfileForm } from '../onboarding/ProfileForm';

const GOAL_LABEL = {
  lose_fat: 'Lose fat',
  gain_muscle: 'Build muscle',
  maintain: 'Maintain',
  improve_fitness: 'Get fitter',
  general_health: 'Feel healthier',
} as const;

function HowWeEstimate() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[17px] font-extrabold">How Crumb estimates</span>
        <ChevronDown
          className={`size-5 text-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-[14px] font-semibold text-muted">
          <p>
            <b className="text-ink">Targets.</b> Resting energy uses the Mifflin–St Jeor equation,
            multiplied by your activity level. Fat loss subtracts up to 20% (never below safe
            minimums); muscle gain adds up to 10%. Protein is 1.0–1.8 g per kg depending on your
            goal.
          </p>
          <p>
            <b className="text-ink">Food.</b> The AI only recognises foods and portions. Calories
            and macros come from Crumb’s food table (USDA data and typical Indian home recipes) and
            simple maths — never invented by the AI.
          </p>
          <p>
            <b className="text-ink">Ranges & confidence.</b> Each item’s range combines how sure we
            are about the food, the amount, the nutrition data and the cooking oil. 🟢 High · 🟡
            Medium · 🔴 Low.
          </p>
          <p>
            <b className="text-ink">Activity.</b> “Extra kcal” is energy above resting, from steps
            beyond ~3,000 and your workouts (MET values from the 2024 Compendium of Physical
            Activities).
          </p>
          <p>
            <b className="text-ink">Learning.</b> When you correct portions or repeat meals, Crumb
            remembers your usual amounts and offers one-tap logging.
          </p>
          <p className="text-[12px]">{DISCLAIMER}</p>
        </div>
      )}
    </Card>
  );
}

function GoogleHealth({ uid, timezone }: { uid: string; timezone: string }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const integration = useLiveDoc<{ connected?: boolean; lastSyncAt?: string } | null>(
    refs.integration(uid, 'google_health'),
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const connected = Boolean(integration.data?.connected);

  async function sync(quiet = false) {
    setBusy('sync');
    try {
      const today = todayKey(timezone);
      const res = await api.googleHealthSync({
        from: addDays(today, -6),
        to: today,
        timezone: timezone || deviceTimeZone(),
      });
      if (!quiet || res.imported)
        toast({
          message: `Synced ${res.imported} day${res.imported === 1 ? '' : 's'} of activity`,
        });
    } catch (err) {
      toast({ message: err instanceof ApiError ? err.message : 'Sync failed', tone: 'warning' });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (params.get('integration') !== 'google_health') return;
    const status = params.get('status');
    setParams({}, { replace: true });
    if (status === 'connected') {
      toast({ message: 'Google Health connected' });
      void sync(true);
    } else if (status) {
      toast({ message: 'Google Health wasn’t connected. Please try again.', tone: 'warning' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy('connect');
    try {
      const { authUrl } = await api.googleHealthStart();
      window.location.assign(authUrl);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_configured') setUnavailable(true);
      else toast({ message: 'Couldn’t start the connection.', tone: 'warning' });
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Google Health"
        subtitle="Steps & active energy from Fitbit / Pixel Watch"
        icon={<Watch className="size-5" />}
        action={connected ? <Pill tone="teal">Connected</Pill> : undefined}
      />
      {unavailable ? (
        <p className="text-[14px] font-semibold text-muted">
          Not set up on this server yet. You can always add steps and workouts by hand.
        </p>
      ) : connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'sync'}
            onClick={() => void sync()}
          >
            Sync last 7 days
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'disconnect'}
            onClick={async () => {
              setBusy('disconnect');
              await api.googleHealthDisconnect().catch(() => undefined);
              setBusy(null);
              toast({ message: 'Disconnected. Synced history stays in your journal.' });
            }}
          >
            Disconnect
          </Button>
          {integration.data?.lastSyncAt && (
            <span className="text-[12px] font-bold text-muted">
              Last sync{' '}
              {new Date(integration.data.lastSyncAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          )}
        </div>
      ) : (
        <>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'connect'}
            onClick={() => void connect()}
          >
            Connect
          </Button>
          <p className="mt-2 text-[12px] font-semibold text-muted">
            Read-only access to activity data. No wearable? Add steps from your phone’s health app
            on the Home screen.
          </p>
        </>
      )}
    </Card>
  );
}

async function exportData(uid: string): Promise<void> {
  const out: Record<string, unknown> = { user: (await getDoc(refs.user(uid))).data() ?? null };
  const sources = {
    entries: refs.entries(uid),
    activities: refs.activities(uid),
    days: refs.days(uid),
    memory: refs.memory(uid),
    meals: refs.meals(uid),
    corrections: refs.corrections(uid),
    insights: collection(refs.user(uid), 'insights'),
  };
  for (const [name, ref] of Object.entries(sources)) {
    const snap = await getDocs(ref);
    out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crumb-export-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProfileScreen() {
  const { uid, profile, targets } = useProfile();
  const { user, linkGoogle, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [leavingGuest, setLeavingGuest] = useState(false);
  const guest = user?.isAnonymous;

  return (
    <div className="space-y-3 pb-6">
      <header className="pt-2">
        <h1 className="text-[28px] font-black tracking-tight">
          {profile.name ? `${profile.name}’s profile` : 'Profile'}
        </h1>
        <p className="text-[14px] font-bold text-muted">{guest ? 'Guest account' : user?.email}</p>
      </header>

      {guest && (
        <Card tone="primary">
          <p className="text-[15px] font-extrabold text-primary-ink">
            You’re using Crumb as a guest
          </p>
          <p className="mt-0.5 text-[14px] font-semibold text-primary-ink">
            Sign in with Google to keep your journal safe and use it on other devices. Nothing gets
            lost.
          </p>
          <Button
            className="mt-3"
            size="sm"
            onClick={async () => {
              try {
                await linkGoogle();
                toast({ message: 'Account saved with Google' });
              } catch {
                toast({ message: 'Couldn’t link that Google account.', tone: 'warning' });
              }
            }}
          >
            Save with Google
          </Button>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Daily targets"
          subtitle={`${GOAL_LABEL[profile.goal]} · ${profile.weightKg} kg · ${profile.heightCm} cm`}
          action={
            <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
              Edit
            </Button>
          }
        />
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['Calories', `~${targets.kcal.toLocaleString('en-IN')}`],
            ['Protein', `~${targets.proteinG} g`],
            ['Carbs', `~${targets.carbsG} g`],
            ['Fat', `~${targets.fatG} g`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-surface-2 px-1 py-2">
              <p className="text-[15px] font-black tabular">{value}</p>
              <p className="text-[11px] font-extrabold text-muted">{label}</p>
            </div>
          ))}
        </div>
        {targets.notes.map((n) => (
          <p key={n} className="mt-2 text-[12px] font-semibold text-muted">
            {n}
          </p>
        ))}
      </Card>

      <HowWeEstimate />

      <SectionTitle>Connections</SectionTitle>
      <GoogleHealth uid={uid} timezone={profile.timezone} />

      <SectionTitle>Your data</SectionTitle>
      <Card>
        <p className="flex items-start gap-2 text-[14px] font-semibold text-muted">
          <Shield className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
          Your journal is private to your account. Photos are analysed and discarded (only a tiny
          thumbnail is kept), and your location is used only while planning a walk.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="soft"
            icon={<Download className="size-4" />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await exportData(uid);
              } catch {
                toast({ message: 'Export needs a connection.', tone: 'warning' });
              } finally {
                setBusy(false);
              }
            }}
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-4" />}
            onClick={() => setDeleting(true)}
          >
            Delete everything
          </Button>
        </div>
      </Card>

      <Button
        variant="ghost"
        block
        icon={<LogOut className="size-5" />}
        onClick={() => (guest ? setLeavingGuest(true) : void signOut())}
      >
        Sign out
      </Button>
      <p className="px-2 text-center text-[11px] font-semibold text-muted">{DISCLAIMER}</p>

      <Sheet open={editing} onOpenChange={setEditing} title="Edit goals & body">
        <ProfileForm
          initial={profile}
          submitLabel="Save"
          onSubmit={async (p) => {
            await saveProfile(uid, p, false);
            setEditing(false);
            toast({ message: 'Targets updated' });
          }}
        />
      </Sheet>

      <Sheet
        open={leavingGuest}
        onOpenChange={setLeavingGuest}
        title="Sign out of the guest account?"
        description="Guest journals live only in this account. Once you sign out, it can’t be opened again."
        footer={
          <div className="space-y-2">
            <Button
              size="lg"
              block
              onClick={async () => {
                setLeavingGuest(false);
                try {
                  await linkGoogle();
                  toast({ message: 'Account saved with Google' });
                } catch {
                  toast({ message: 'Couldn’t link that Google account.', tone: 'warning' });
                }
              }}
            >
              Save with Google first
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => void signOut()}>
              Sign out anyway
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>

      <Sheet
        open={deleting}
        onOpenChange={(o) => {
          setDeleting(o);
          setConfirmText('');
        }}
        title="Delete everything?"
        description="This permanently removes your journal, memory, connections and account."
        footer={
          <Button
            variant="danger"
            size="lg"
            block
            loading={busy}
            disabled={confirmText.trim().toLowerCase() !== 'delete'}
            onClick={async () => {
              setBusy(true);
              try {
                await api.deleteAccount();
                await signOut().catch(() => undefined);
                navigate('/welcome', { replace: true });
              } catch (err) {
                toast({
                  message: err instanceof ApiError ? err.message : 'Couldn’t delete right now.',
                  tone: 'warning',
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete my data
          </Button>
        }
      >
        <label className="block text-[14px] font-bold text-muted">
          Type <b className="text-ink">delete</b> to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-3 text-[16px] font-bold outline-none focus:border-danger"
          />
        </label>
      </Sheet>
    </div>
  );
}
