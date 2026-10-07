import type { Activity } from '../schemas/activity';
import type { DateKey } from '../schemas/common';
import type { FoodEntry } from '../schemas/food';
import type { Profile } from '../schemas/profile';
import type { DailySummary } from '../schemas/summary';
import { bmrMifflin } from '../targets/targets';
import { dayExpenditure, energyBalance } from '../energy/energy';
import { sumItems } from '../nutrition/estimate';
import { round1 } from '../util';

/** Bump when any formula changes so stored day summaries are recomputed lazily. */
export const ENGINE_VERSION = 1;

/** Deterministic daily summary from that day's entries and activities. */
export function summarizeDay(input: {
  date: DateKey;
  entries: readonly FoodEntry[];
  activities: readonly Activity[];
  profile: Pick<Profile, 'weightKg' | 'heightCm' | 'sex' | 'age'>;
  now?: Date;
}): DailySummary {
  const confirmed = input.entries.filter((e) => e.status === 'confirmed' && e.date === input.date);
  const items = confirmed.flatMap((e) => e.items);
  const totals = sumItems(items);

  const proteinByMeal: Record<string, number> = {};
  for (const e of confirmed) {
    proteinByMeal[e.mealType] = round1(
      (proteinByMeal[e.mealType] ?? 0) + e.totals.nutrition.proteinG,
    );
  }

  const bmr = bmrMifflin(input.profile);
  const activity = dayExpenditure(
    input.activities.filter((a) => a.date === input.date),
    input.profile,
    bmr,
  );
  const balance = energyBalance(
    { kcal: totals.nutrition.kcal, low: totals.kcal.low, high: totals.kcal.high },
    activity.expenditure,
  );

  return {
    date: input.date,
    intake: totals.nutrition,
    intakeRange: { kcal: totals.kcal, proteinG: totals.proteinG },
    mealsLogged: confirmed.length,
    proteinByMeal,
    steps: Math.round(activity.steps),
    stepsSource: activity.stepsSource,
    activeKcal: activity.activeKcal,
    exerciseMin: activity.exerciseMin,
    strengthSessions: activity.strengthSessions,
    expenditure: activity.expenditure,
    balance,
    engineVersion: ENGINE_VERSION,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** JSON with object keys sorted at every level (Firestore does not preserve map key order). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** True when a stored summary no longer matches what the engine would compute. */
export function summaryIsStale(stored: DailySummary | undefined, fresh: DailySummary): boolean {
  if (!stored) return true;
  if (stored.engineVersion !== fresh.engineVersion) return true;
  const { updatedAt: _a, ...s } = stored;
  const { updatedAt: _b, ...f } = fresh;
  return stableStringify(s) !== stableStringify(f);
}
