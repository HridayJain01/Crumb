import type { Activity, Intensity, WorkoutType } from '../schemas/activity';
import type { AiActivity } from '../schemas/ai';
import type { Confidence, Range } from '../schemas/common';
import type { Profile, Sex } from '../schemas/profile';
import type { Estimate } from '../schemas/summary';
import { round1 } from '../util';
import { metFor, SPEED_KMH } from './met';

/*
 * Energy model (documented in docs/estimation.md). All activity numbers are NET kcal
 * ("extra" above resting) so they can be added to the BMR-based baseline without double counting.
 *
 *  Expenditure ≈ BMR × 1.2  (resting + digestion + light daily movement, ~3,000 steps)
 *              + step energy beyond 3,000 steps
 *              + logged workouts
 *  With device active energy: BMR × 1.1 + device active kcal + manual workouts the device didn't see.
 */

export const BASELINE_FACTOR = 1.2;
export const BASELINE_FACTOR_WITH_DEVICE = 1.1;
export const BASELINE_STEPS = 3000;
/** Net walking cost ≈ (3.5 − 1) MET at 5 km/h ≈ 0.5 kcal per kg per km. */
export const NET_WALK_KCAL_PER_KG_KM = 0.5;

const SIGMA_BMR = 0.1;
const SIGMA_STEPS = 0.25;
const SIGMA_EXERCISE = 0.3;
const SIGMA_DEVICE = 0.2;

export function strideKm(heightCm: number, sex: Sex): number {
  const factor = sex === 'female' ? 0.413 : sex === 'male' ? 0.415 : 0.414;
  return (factor * heightCm) / 100 / 1000;
}

export function stepsToKm(steps: number, heightCm: number, sex: Sex): number {
  return steps * strideKm(heightCm, sex);
}

/** Net kcal from steps above the baseline already included in BMR × 1.2. */
export function stepsNetKcal(
  steps: number,
  profile: Pick<Profile, 'weightKg' | 'heightCm' | 'sex'>,
  baselineSteps = BASELINE_STEPS,
): number {
  const extra = Math.max(0, steps - baselineSteps);
  return (
    extra * strideKm(profile.heightCm, profile.sex) * NET_WALK_KCAL_PER_KG_KM * profile.weightKg
  );
}

export function exerciseNetKcal(met: number, weightKg: number, minutes: number): number {
  return Math.max(0, met - 1) * weightKg * (minutes / 60);
}

export interface ActivityEstimate {
  durationMin: number;
  distanceKm?: number;
  kcal: number;
  range: Range;
  met: number;
  confidence: Confidence;
}

/** Deterministic kcal for a workout from its type, intensity and duration or distance. */
export function estimateActivity(
  input: {
    type: WorkoutType;
    intensity: Intensity;
    durationMin?: number | null;
    distanceKm?: number | null;
  },
  profile: Pick<Profile, 'weightKg'>,
): ActivityEstimate {
  const met = metFor(input.type, input.intensity);
  const speed = SPEED_KMH[input.type]?.[input.intensity];
  let durationMin = input.durationMin ?? undefined;
  let distanceKm = input.distanceKm ?? undefined;
  let confidence: Confidence = 'medium';
  if (durationMin === undefined && distanceKm !== undefined && speed) {
    durationMin = (distanceKm / speed) * 60;
  }
  if (distanceKm === undefined && durationMin !== undefined && speed) {
    distanceKm = (durationMin / 60) * speed;
  }
  if (durationMin === undefined) {
    durationMin = 30;
    confidence = 'low';
  }
  const kcal = exerciseNetKcal(met, profile.weightKg, durationMin);
  return {
    durationMin: Math.round(durationMin),
    distanceKm: distanceKm !== undefined ? round1(distanceKm) : undefined,
    kcal: Math.round(kcal),
    range: {
      low: Math.round(kcal * (1 - SIGMA_EXERCISE)),
      high: Math.round(kcal * (1 + SIGMA_EXERCISE)),
    },
    met,
    confidence,
  };
}

export function estimateAiActivity(
  a: AiActivity,
  profile: Pick<Profile, 'weightKg'>,
): ActivityEstimate {
  return estimateActivity(
    { type: a.type, intensity: a.intensity, durationMin: a.durationMin, distanceKm: a.distanceKm },
    profile,
  );
}

function isWorkout(a: Activity): boolean {
  return a.type !== 'steps';
}

function walkLikeSteps(a: Activity, profile: Pick<Profile, 'heightCm' | 'sex'>): number {
  if (a.type !== 'walk' && a.type !== 'run') return 0;
  const intensity = a.intensity ?? 'moderate';
  const speed = SPEED_KMH[a.type]?.[intensity] ?? 5;
  const km = a.distanceKm ?? ((a.durationMin ?? 0) / 60) * speed;
  return km / strideKm(profile.heightCm, profile.sex);
}

export interface DayActivityResult {
  steps: number;
  stepsSource: 'device' | 'manual' | 'none';
  activeKcal: number;
  exerciseMin: number;
  strengthSessions: number;
  expenditure: Estimate;
}

/** Combines BMR, steps and workouts into the day's estimated expenditure (with a range). */
export function dayExpenditure(
  activities: readonly Activity[],
  profile: Pick<Profile, 'weightKg' | 'heightCm' | 'sex'>,
  bmr: number,
): DayActivityResult {
  const deviceSteps = activities.filter((a) => a.type === 'steps' && a.source !== 'manual');
  const manualSteps = activities.filter((a) => a.type === 'steps' && a.source === 'manual');
  const stepDoc = deviceSteps.length ? deviceSteps : manualSteps;
  const steps = Math.max(0, ...stepDoc.map((a) => a.steps ?? 0));
  const stepsSource = deviceSteps.length ? 'device' : manualSteps.length ? 'manual' : 'none';
  const deviceActive = Math.max(0, ...deviceSteps.map((a) => a.kcal));

  const workouts = activities.filter(isWorkout);
  const exerciseMin = workouts.reduce((s, a) => s + (a.durationMin ?? 0), 0);
  const strengthSessions = workouts.filter(
    (a) => a.type === 'strength' || a.type === 'hiit',
  ).length;

  if (deviceActive > 0) {
    const manual = workouts.filter((a) => a.source === 'manual');
    const manualKcal = manual.reduce((s, a) => s + a.kcal, 0);
    const base = bmr * BASELINE_FACTOR_WITH_DEVICE;
    const kcal = base + deviceActive + manualKcal;
    const sd = Math.sqrt(
      (base * SIGMA_BMR) ** 2 +
        (deviceActive * SIGMA_DEVICE) ** 2 +
        (manualKcal * SIGMA_EXERCISE) ** 2,
    );
    return {
      steps,
      stepsSource,
      activeKcal: Math.round(deviceActive + manualKcal),
      exerciseMin: Math.round(exerciseMin),
      strengthSessions,
      expenditure: {
        kcal: Math.round(kcal),
        low: Math.round(kcal - sd),
        high: Math.round(kcal + sd),
      },
    };
  }

  // Assume logged walks/runs are already inside the step count, so don't count them twice.
  const walkSteps = steps > 0 ? workouts.reduce((s, a) => s + walkLikeSteps(a, profile), 0) : 0;
  const stepKcal = stepsNetKcal(Math.max(0, steps - walkSteps), profile);
  const workoutKcal = workouts.reduce((s, a) => s + a.kcal, 0);
  const base = bmr * BASELINE_FACTOR;
  const kcal = base + stepKcal + workoutKcal;
  const sd = Math.sqrt(
    (base * SIGMA_BMR) ** 2 + (stepKcal * SIGMA_STEPS) ** 2 + (workoutKcal * SIGMA_EXERCISE) ** 2,
  );
  return {
    steps,
    stepsSource,
    activeKcal: Math.round(stepKcal + workoutKcal),
    exerciseMin: Math.round(exerciseMin),
    strengthSessions,
    expenditure: {
      kcal: Math.round(kcal),
      low: Math.round(kcal - sd),
      high: Math.round(kcal + sd),
    },
  };
}

/** Intake − expenditure, with the combined uncertainty deciding "roughly balanced". */
export function energyBalance(
  intake: { kcal: number; low: number; high: number },
  expenditure: Estimate,
): Estimate & { label: 'deficit' | 'surplus' | 'balanced' } {
  const kcal = intake.kcal - expenditure.kcal;
  const intakeSd = (intake.high - intake.low) / 2;
  const expSd = (expenditure.high - expenditure.low) / 2;
  const sd = Math.sqrt(intakeSd ** 2 + expSd ** 2);
  const label = Math.abs(kcal) <= Math.max(sd, 100) ? 'balanced' : kcal < 0 ? 'deficit' : 'surplus';
  return { kcal: Math.round(kcal), low: Math.round(kcal - sd), high: Math.round(kcal + sd), label };
}

export const PACE: Record<'easy' | 'normal' | 'brisk', { intensity: Intensity; speedKmh: number }> =
  {
    easy: { intensity: 'light', speedKmh: 3.5 },
    normal: { intensity: 'moderate', speedKmh: 5 },
    brisk: { intensity: 'vigorous', speedKmh: 6 },
  };

/** Distance/time needed for a walk to burn a target amount of extra kcal (or what a time burns). */
export function walkPlan(input: {
  targetKcal?: number;
  targetMin?: number;
  weightKg: number;
  pace: 'easy' | 'normal' | 'brisk';
}): { distanceKm: number; durationMin: number; kcal: number; low: number; high: number } {
  const { intensity, speedKmh } = PACE[input.pace];
  const netPerKm = ((metFor('walk', intensity) - 1) / speedKmh) * input.weightKg;
  let distanceKm: number;
  if (input.targetKcal !== undefined) distanceKm = input.targetKcal / netPerKm;
  else distanceKm = ((input.targetMin ?? 30) / 60) * speedKmh;
  distanceKm = Math.min(Math.max(distanceKm, 0.5), 25);
  const kcal = distanceKm * netPerKm;
  return {
    distanceKm: round1(distanceKm),
    durationMin: Math.round((distanceKm / speedKmh) * 60),
    kcal: Math.round(kcal),
    low: Math.round(kcal * (1 - SIGMA_EXERCISE)),
    high: Math.round(kcal * (1 + SIGMA_EXERCISE)),
  };
}
