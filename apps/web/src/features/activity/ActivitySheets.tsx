import { useEffect, useMemo, useState } from 'react';
import { Footprints } from 'lucide-react';
import {
  approxKcal,
  estimateActivity,
  estimateAiActivity,
  formatRange,
  parseActivityText,
  stepsNetKcal,
  type AiActivity,
  type Intensity,
  type Profile,
  type WorkoutType,
} from '@crumb/core';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Field, Segmented } from '../../components/ui/Field';
import { Stepper } from '../../components/ui/Stepper';
import { useToast } from '../../components/ui/Toast';
import { addWorkout, deleteActivity, setManualSteps } from '../../data/mutations';
import { api, ApiError } from '../../lib/api';

export const WORKOUT_CHOICES: { type: WorkoutType; label: string; emoji: string }[] = [
  { type: 'walk', label: 'Walk', emoji: '🚶' },
  { type: 'run', label: 'Run', emoji: '🏃' },
  { type: 'strength', label: 'Gym / strength', emoji: '🏋️' },
  { type: 'yoga', label: 'Yoga', emoji: '🧘' },
  { type: 'cycling', label: 'Cycling', emoji: '🚴' },
  { type: 'hiit', label: 'HIIT', emoji: '⚡' },
  { type: 'sports', label: 'Sports', emoji: '🏸' },
  { type: 'dance', label: 'Dance', emoji: '💃' },
  { type: 'swimming', label: 'Swim', emoji: '🏊' },
];

/** Manual workout in two taps: type chip + duration (PRD §23). */
export function WorkoutSheet({
  open,
  onClose,
  uid,
  date,
  profile,
  initialType = 'walk',
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  date: string;
  profile: Profile;
  initialType?: WorkoutType;
}) {
  const toast = useToast();
  const [type, setType] = useState<WorkoutType>(initialType);
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<AiActivity[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setType(initialType);
      setParsed(null);
      setText('');
    }
  }, [open, initialType]);

  const est = useMemo(
    () => estimateActivity({ type, intensity, durationMin: minutes }, profile),
    [type, intensity, minutes, profile],
  );

  function save(list: { a: AiActivity | null }[]) {
    for (const { a } of list) {
      const e = a ? estimateAiActivity(a, profile) : est;
      const label = a?.label ?? WORKOUT_CHOICES.find((c) => c.type === type)?.label ?? 'Workout';
      const id = addWorkout(uid, date, {
        type: a?.type ?? type,
        label,
        intensity: a?.intensity ?? intensity,
        durationMin: e.durationMin,
        distanceKm: e.distanceKm,
        kcal: e.kcal,
        low: e.range.low,
        high: e.range.high,
        met: e.met,
        confidence: e.confidence,
      });
      toast({
        message: `${label} added · ${approxKcal(e.kcal)} extra kcal`,
        action: { label: 'Undo', onClick: () => deleteActivity(uid, id) },
      });
    }
    onClose();
  }

  async function interpret() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await api.interpretActivity({ text });
      setParsed(res.interpretation.activities);
    } catch (err) {
      if (err instanceof ApiError || err instanceof Error)
        setParsed(parseActivityText(text).activities);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add activity"
      description="Estimates are “extra” calories above resting."
      footer={
        parsed ? (
          <Button
            size="lg"
            block
            disabled={!parsed.length}
            onClick={() => save(parsed.map((a) => ({ a })))}
          >
            Add {parsed.length || ''} {parsed.length === 1 ? 'activity' : 'activities'}
          </Button>
        ) : (
          <Button size="lg" block onClick={() => save([{ a: null }])}>
            Add · ~{formatRange(est.range.low, est.range.high)} kcal
          </Button>
        )
      }
    >
      {parsed ? (
        <div className="space-y-2">
          {parsed.length === 0 && (
            <p className="font-bold text-muted">
              Couldn’t find an activity with a duration in that.
            </p>
          )}
          {parsed.map((a, i) => {
            const e = estimateAiActivity(a, profile);
            return (
              <div
                key={i}
                className="flex items-center justify-between rounded-2xl bg-surface p-3 shadow-card"
              >
                <div>
                  <p className="font-extrabold">{a.label}</p>
                  <p className="text-[13px] font-bold text-muted">
                    {e.durationMin} min · {a.intensity}
                    {e.distanceKm ? ` · ${e.distanceKm} km` : ''}
                  </p>
                </div>
                <p className="font-black tabular">
                  ~{formatRange(e.range.low, e.range.high)}{' '}
                  <span className="text-[12px] text-muted">kcal</span>
                </p>
              </div>
            );
          })}
          <Button variant="ghost" onClick={() => setParsed(null)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {WORKOUT_CHOICES.map((c) => (
              <Chip key={c.type} selected={type === c.type} onClick={() => setType(c.type)}>
                <span aria-hidden>{c.emoji}</span> {c.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold">Duration</span>
            <Stepper
              label="minutes"
              value={minutes}
              step={5}
              min={5}
              max={240}
              onChange={setMinutes}
              format={(v) => `${v} min`}
            />
          </div>
          <Segmented
            label="Intensity"
            value={intensity}
            onChange={setIntensity}
            options={[
              { value: 'light', label: 'Easy' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'vigorous', label: 'Hard' },
            ]}
          />
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="mb-2 text-[13px] font-extrabold text-muted">Or describe it</p>
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && interpret()}
                placeholder="30-minute upper-body workout"
                aria-label="Describe your activity"
                className="h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] font-bold outline-none focus:border-primary"
              />
              <Button variant="soft" loading={busy} onClick={interpret} disabled={!text.trim()}>
                Read
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Today's steps typed from the phone's pedometer (no wearable needed). */
export function StepsSheet({
  open,
  onClose,
  uid,
  date,
  profile,
  current,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  date: string;
  profile: Profile;
  current: number;
}) {
  const toast = useToast();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open) setValue(current ? String(current) : '');
  }, [open, current]);
  const steps = Number(value) || 0;
  const kcal = stepsNetKcal(steps, profile);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Today’s steps"
      description="Copy the total from your phone’s health app."
      footer={
        <Button
          size="lg"
          block
          disabled={!steps || steps > 150000}
          onClick={() => {
            setManualSteps(uid, date, steps, profile);
            toast({ message: `${steps.toLocaleString('en-IN')} steps saved` });
            onClose();
          }}
        >
          Save steps
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label="Steps today"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
          suffix={<Footprints className="size-5" aria-hidden />}
        />
        <div className="flex flex-wrap gap-2">
          {[2000, 5000, 8000, 10000].map((n) => (
            <Chip key={n} onClick={() => setValue(String(n))}>
              {n.toLocaleString('en-IN')}
            </Chip>
          ))}
        </div>
        {steps > 0 && (
          <p className="text-[14px] font-bold text-muted">
            {approxKcal(kcal)} extra kcal beyond an average sedentary day (above ~3,000 steps).
          </p>
        )}
      </div>
    </Sheet>
  );
}
