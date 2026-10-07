import { useMemo, useState } from 'react';
import { ExternalLink, MapPin, Navigation, TriangleAlert } from 'lucide-react';
import {
  formatRange,
  mapsEmbedUrl,
  walkPlan,
  WALK_DISCLAIMER,
  type Pace,
  type Profile,
  type RouteOption,
} from '@crumb/core';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Field';
import { Stepper } from '../../components/ui/Stepper';
import { Pill } from '../../components/ui/Badge';
import { api, ApiError } from '../../lib/api';

const EMBED_KEY = import.meta.env.VITE_MAPS_EMBED_KEY as string | undefined;

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 120_000 },
    );
  });
}

function LoopSketch({ route }: { route: RouteOption }) {
  // Tiny offline preview of the loop's shape when no Maps Embed key is configured.
  const pts = [route.origin, ...route.waypoints];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lngs),
    Math.max(...lngs),
  ];
  const sx = (lng: number) => 20 + ((lng - minLng) / (maxLng - minLng || 1)) * 260;
  const sy = (lat: number) => 20 + (1 - (lat - minLat) / (maxLat - minLat || 1)) * 100;
  const d =
    pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.lng).toFixed(1)},${sy(p.lat).toFixed(1)}`).join(' ') +
    ' Z';
  return (
    <svg viewBox="0 0 300 140" className="h-36 w-full rounded-2xl bg-teal-soft" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth={4}
        strokeLinejoin="round"
        strokeDasharray="2 8"
        strokeLinecap="round"
      />
      <circle
        cx={sx(route.origin.lng)}
        cy={sy(route.origin.lat)}
        r={7}
        fill="var(--color-primary)"
        stroke="#fff"
        strokeWidth={3}
      />
    </svg>
  );
}

function RouteCard({ route }: { route: RouteOption }) {
  return (
    <div className="rounded-card bg-surface p-3 shadow-card">
      {EMBED_KEY ? (
        <iframe
          title={`Map preview: ${route.label}`}
          className="h-44 w-full rounded-2xl border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={mapsEmbedUrl(EMBED_KEY, route.origin, route.waypoints)}
        />
      ) : (
        <LoopSketch route={route} />
      )}
      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[16px] font-extrabold">🚶 {route.label}</p>
          <p className="text-[14px] font-bold text-muted tabular">
            ~{route.distanceKm} km · ~{route.durationMin} min · ~
            {formatRange(route.kcal.low, route.kcal.high)} extra kcal
          </p>
        </div>
        <Pill tone={route.measured ? 'teal' : 'neutral'}>
          {route.measured ? 'Measured' : 'Estimated'}
        </Pill>
      </div>
      {route.warnings.map((w) => (
        <p key={w} className="mt-2 flex items-start gap-1.5 text-[12px] font-bold text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
        </p>
      ))}
      <a
        href={route.mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal font-bold text-white transition active:scale-[0.98]"
      >
        <Navigation className="size-5" aria-hidden /> Open in Google Maps
        <ExternalLink className="size-4 opacity-80" aria-hidden />
      </a>
    </div>
  );
}

/** "I want to burn ~250 kcal" or "I have 30 minutes" → walking loops near you (PRD §27–28). */
export function WalkPlanner({
  open,
  onClose,
  profile,
  initialMinutes = 30,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  initialMinutes?: number;
}) {
  const [mode, setMode] = useState<'time' | 'kcal'>('time');
  const [minutes, setMinutes] = useState(initialMinutes);
  const [kcal, setKcal] = useState(150);
  const [pace, setPace] = useState<Pace>('normal');
  const [routes, setRoutes] = useState<RouteOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () =>
      walkPlan(
        mode === 'time'
          ? { targetMin: minutes, weightKg: profile.weightKg, pace }
          : { targetKcal: kcal, weightKg: profile.weightKg, pace },
      ),
    [mode, minutes, kcal, pace, profile.weightKg],
  );

  async function find() {
    setBusy(true);
    setError(null);
    setRoutes(null);
    try {
      const origin = await getPosition();
      const res = await api.walkRoutes({
        origin,
        weightKg: profile.weightKg,
        pace,
        ...(mode === 'time' ? { targetMin: minutes } : { targetKcal: kcal }),
      });
      setRoutes(res.options);
    } catch (err) {
      if (err instanceof ApiError)
        setError(err.code === 'network' ? 'Route planning needs a connection.' : err.message);
      else if ((err as GeolocationPositionError).code === 1)
        setError(
          'Location permission was denied. You can still walk the suggested time from anywhere.',
        );
      else setError('Couldn’t get your location. Try again outdoors or with location turned on.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Plan a walk"
      description="Loops that start and end where you are."
    >
      <div className="space-y-4">
        <Segmented
          label="Plan by"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setRoutes(null);
          }}
          options={[
            { value: 'time', label: 'I have time' },
            { value: 'kcal', label: 'Burn calories' },
          ]}
        />
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-extrabold">
            {mode === 'time' ? 'Minutes' : 'Extra kcal'}
          </span>
          {mode === 'time' ? (
            <Stepper
              label="minutes"
              value={minutes}
              step={5}
              min={10}
              max={120}
              onChange={setMinutes}
              format={(v) => `${v} min`}
            />
          ) : (
            <Stepper
              label="kilocalories"
              value={kcal}
              step={25}
              min={50}
              max={600}
              onChange={setKcal}
              format={(v) => `${v}`}
            />
          )}
        </div>
        <Segmented
          label="Pace"
          value={pace}
          onChange={setPace}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'normal', label: 'Normal' },
            { value: 'brisk', label: 'Brisk' },
          ]}
        />
        <div className="rounded-2xl bg-teal-soft p-3 text-teal">
          <p className="text-[18px] font-black tabular">
            ~{plan.distanceKm} km · ~{plan.durationMin} min
          </p>
          <p className="text-[13px] font-bold">
            ≈ {formatRange(plan.low, plan.high)} extra kcal for you. Estimated from your weight and
            pace.
          </p>
        </div>
        <Button
          size="lg"
          variant="secondary"
          block
          loading={busy}
          icon={<MapPin className="size-5" />}
          onClick={() => void find()}
        >
          Find routes near me
        </Button>
        <p className="text-center text-[12px] font-semibold text-muted">
          Your location is used once to plan the loop and is never stored.
        </p>
        {error && (
          <p className="rounded-2xl bg-warning-soft p-3 text-[14px] font-bold text-warning">
            {error}
          </p>
        )}
        {routes && (
          <div className="space-y-3">
            {routes.map((r) => (
              <RouteCard key={r.id} route={r} />
            ))}
            <p className="text-[12px] font-semibold text-muted">{WALK_DISCLAIMER}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
