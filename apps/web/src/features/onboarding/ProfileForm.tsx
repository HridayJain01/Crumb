import { useMemo, useState, type FormEvent } from 'react';
import {
  computeTargets,
  ProfileSchema,
  type ActivityLevel,
  type Diet,
  type Goal,
  type Profile,
  type Sex,
} from '@crumb/core';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Field, Segmented } from '../../components/ui/Field';
import { deviceTimeZone } from '../../lib/time';

const ACTIVITY: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  { value: 'light', label: 'Lightly active', hint: 'Walks, exercise 1–3×/week' },
  { value: 'moderate', label: 'Moderately active', hint: 'Exercise 3–5×/week' },
  { value: 'very_active', label: 'Very active', hint: 'Hard training or physical job' },
];

const GOALS: { value: Goal; label: string; emoji: string }[] = [
  { value: 'lose_fat', label: 'Lose fat', emoji: '🔥' },
  { value: 'gain_muscle', label: 'Build muscle', emoji: '💪' },
  { value: 'maintain', label: 'Maintain', emoji: '⚖️' },
  { value: 'improve_fitness', label: 'Get fitter', emoji: '🏃' },
  { value: 'general_health', label: 'Feel healthier', emoji: '🌱' },
];

const DIETS: { value: Diet; label: string }[] = [
  { value: 'any', label: 'No restrictions' },
  { value: 'veg', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'jain', label: 'Jain' },
];

interface Draft {
  name: string;
  age: string;
  sex: Sex;
  heightCm: string;
  feet: string;
  inches: string;
  weight: string;
  units: 'metric' | 'imperial';
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  diet: Diet;
}

function toDraft(p?: Profile): Draft {
  const imperial = p?.units === 'imperial';
  const totalIn = p ? p.heightCm / 2.54 : 0;
  return {
    name: p?.name ?? '',
    age: p ? String(p.age) : '',
    sex: p?.sex ?? 'female',
    heightCm: p ? String(Math.round(p.heightCm)) : '',
    feet: p ? String(Math.floor(totalIn / 12)) : '',
    inches: p ? String(Math.round(totalIn % 12)) : '',
    weight: p
      ? String(imperial ? Math.round(p.weightKg * 2.2046) : Math.round(p.weightKg * 10) / 10)
      : '',
    units: p?.units ?? 'metric',
    activityLevel: p?.activityLevel ?? null,
    goal: p?.goal ?? null,
    diet: p?.diet ?? 'any',
  };
}

function toProfile(
  d: Draft,
  base?: Profile,
): { profile?: Profile; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const age = Number(d.age);
  const heightCm =
    d.units === 'metric'
      ? Number(d.heightCm)
      : (Number(d.feet) * 12 + Number(d.inches || 0)) * 2.54;
  const weightKg = d.units === 'metric' ? Number(d.weight) : Number(d.weight) / 2.2046;
  if (!d.age || !Number.isInteger(age) || age < 18 || age > 110)
    errors.age = 'Crumb is designed for adults (18+).';
  if (!heightCm || heightCm < 100 || heightCm > 250) errors.height = 'Enter your height.';
  if (!weightKg || weightKg < 30 || weightKg > 300) errors.weight = 'Enter your weight.';
  if (!d.activityLevel) errors.activity = 'Pick the closest match.';
  if (!d.goal) errors.goal = 'Pick a goal.';
  if (Object.keys(errors).length) return { errors };
  const parsed = ProfileSchema.safeParse({
    ...base,
    name: d.name.trim() || undefined,
    age,
    sex: d.sex,
    heightCm: Math.round(heightCm * 10) / 10,
    weightKg: Math.round(weightKg * 10) / 10,
    activityLevel: d.activityLevel,
    goal: d.goal,
    diet: d.diet,
    units: d.units,
    timezone: base?.timezone ?? deviceTimeZone(),
  });
  if (!parsed.success) return { errors: { form: 'Please check the values.' } };
  return { profile: parsed.data, errors: {} };
}

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Profile;
  submitLabel: string;
  onSubmit: (profile: Profile) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  const { profile, errors } = useMemo(() => toProfile(d, initial), [d, initial]);
  const preview = useMemo(() => (profile ? computeTargets(profile) : null), [profile]);
  const show = (k: string) => (touched ? errors[k] : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!profile) return;
    setSaving(true);
    try {
      await onSubmit(profile);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Field
        label="What should we call you? (optional)"
        value={d.name}
        onChange={(e) => set('name', e.target.value)}
        maxLength={40}
        autoComplete="given-name"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Age"
          inputMode="numeric"
          value={d.age}
          onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))}
          error={show('age')}
          suffix="yrs"
        />
        <div>
          <span className="mb-1 block text-[13px] font-extrabold text-muted">Sex</span>
          <Segmented
            label="Sex"
            value={d.sex}
            onChange={(v) => set('sex', v)}
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-extrabold text-muted">Body</span>
          <div className="w-40">
            <Segmented
              label="Units"
              value={d.units}
              onChange={(v) => set('units', v)}
              options={[
                { value: 'metric', label: 'cm/kg' },
                { value: 'imperial', label: 'ft/lb' },
              ]}
            />
          </div>
        </div>
        {d.units === 'metric' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Height"
              inputMode="numeric"
              value={d.heightCm}
              onChange={(e) => set('heightCm', e.target.value.replace(/[^\d.]/g, ''))}
              suffix="cm"
              error={show('height')}
            />
            <Field
              label="Weight"
              inputMode="decimal"
              value={d.weight}
              onChange={(e) => set('weight', e.target.value.replace(/[^\d.]/g, ''))}
              suffix="kg"
              error={show('weight')}
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Height"
              inputMode="numeric"
              value={d.feet}
              onChange={(e) => set('feet', e.target.value.replace(/\D/g, ''))}
              suffix="ft"
              error={show('height')}
            />
            <Field
              label={'\u00a0'}
              aria-label="Inches"
              inputMode="numeric"
              value={d.inches}
              onChange={(e) => set('inches', e.target.value.replace(/\D/g, ''))}
              suffix="in"
            />
            <Field
              label="Weight"
              inputMode="decimal"
              value={d.weight}
              onChange={(e) => set('weight', e.target.value.replace(/[^\d.]/g, ''))}
              suffix="lb"
              error={show('weight')}
            />
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-[13px] font-extrabold text-muted">
          How active are you usually?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITY.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-pressed={d.activityLevel === a.value}
              onClick={() => set('activityLevel', a.value)}
              className={`rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                d.activityLevel === a.value
                  ? 'border-primary bg-primary-soft'
                  : 'border-line bg-surface'
              }`}
            >
              <span className="block text-[15px] font-extrabold">{a.label}</span>
              <span className="block text-[12px] font-semibold text-muted">{a.hint}</span>
            </button>
          ))}
        </div>
        {show('activity') && (
          <p className="mt-1 text-[12px] font-semibold text-danger">{errors.activity}</p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-extrabold text-muted">Main goal</legend>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g.value} selected={d.goal === g.value} onClick={() => set('goal', g.value)}>
              <span aria-hidden>{g.emoji}</span> {g.label}
            </Chip>
          ))}
        </div>
        {show('goal') && (
          <p className="mt-1 text-[12px] font-semibold text-danger">{errors.goal}</p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-extrabold text-muted">
          Food preference (optional)
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((g) => (
            <Chip key={g.value} selected={d.diet === g.value} onClick={() => set('diet', g.value)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur safe-bottom">
        <div
          className="mb-3 flex items-center justify-between rounded-2xl bg-surface px-4 py-3 shadow-card"
          aria-live="polite"
        >
          {preview ? (
            <>
              <div>
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted">
                  Your daily targets
                </p>
                <p className="text-lg font-black tabular">
                  ~{preview.kcal.toLocaleString('en-IN')} kcal · ~{preview.proteinG} g protein
                </p>
              </div>
              <span className="text-2xl" aria-hidden>
                🎯
              </span>
            </>
          ) : (
            <p className="text-[14px] font-bold text-muted">
              Fill in the basics to see your targets.
            </p>
          )}
        </div>
        {preview?.notes.map((n) => (
          <p key={n} className="mb-2 text-[12px] font-semibold text-muted">
            {n}
          </p>
        ))}
        <Button type="submit" size="lg" block loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
