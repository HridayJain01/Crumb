import type { DateKey, MealType } from '../schemas/common';
import type { DailySummary } from '../schemas/summary';
import { isWeekend } from '../dates';
import { mean } from '../util';

/*
 * Weekly / long-term statistics (PRD §32–33). Deterministic; conclusions are only drawn
 * when there is enough data, and every pattern carries its data-sufficiency level.
 */

export type Sufficiency = 'insufficient' | 'early' | 'emerging' | 'established';

export const SUFFICIENCY_LABEL: Record<Sufficiency, string> = {
  insufficient: 'Not enough data yet',
  early: 'Early look',
  emerging: 'Early pattern',
  established: 'Stronger trend',
};

export function sufficiencyFor(daysLogged: number): Sufficiency {
  if (daysLogged < 3) return 'insufficient';
  if (daysLogged < 14) return 'early';
  if (daysLogged < 30) return 'emerging';
  return 'established';
}

export interface PeriodStats {
  from: DateKey;
  to: DateKey;
  daysLogged: number;
  sufficiency: Sufficiency;
  avgKcal?: number;
  avgProteinG?: number;
  avgSteps?: number;
  workoutSessions: number;
  exerciseMin: number;
  /** Share of logged days near the calorie target with protein ≥ 90% of target. */
  adherencePct?: number;
  lowestProteinMeal?: MealType;
  streakDays: number;
  bestProteinDay?: { date: DateKey; proteinG: number };
  observations: string[];
}

function logged(d: DailySummary): boolean {
  return d.mealsLogged > 0;
}

/** Consecutive days with at least one logged meal, ending today (or yesterday if today is empty). */
export function loggingStreak(days: readonly DailySummary[], today: DateKey): number {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let streak = 0;
  let cursor = new Date(`${today}T00:00:00Z`);
  if (!byDate.get(today) || !logged(byDate.get(today)!)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    const d = byDate.get(key);
    if (!d || !logged(d)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export function periodStats(
  days: readonly DailySummary[],
  targets: { kcal: number; proteinG: number },
  range: { from: DateKey; to: DateKey; today: DateKey },
): PeriodStats {
  const inRange = days.filter((d) => d.date >= range.from && d.date <= range.to);
  const loggedDays = inRange.filter(logged);
  const daysLogged = loggedDays.length;
  const sufficiency = sufficiencyFor(daysLogged);
  const avgKcal = mean(loggedDays.map((d) => d.intake.kcal));
  const avgProteinG = mean(loggedDays.map((d) => d.intake.proteinG));
  const stepDays = inRange.filter((d) => d.steps > 0);
  const avgSteps = mean(stepDays.map((d) => d.steps));
  const workoutSessions = inRange.reduce(
    (s, d) => s + d.strengthSessions + (d.exerciseMin > 0 && d.strengthSessions === 0 ? 1 : 0),
    0,
  );
  const exerciseMin = inRange.reduce((s, d) => s + d.exerciseMin, 0);

  const adherent = loggedDays.filter(
    (d) =>
      Math.abs(d.intake.kcal - targets.kcal) <= targets.kcal * 0.1 &&
      d.intake.proteinG >= targets.proteinG * 0.9,
  ).length;
  const adherencePct = daysLogged ? Math.round((adherent / daysLogged) * 100) : undefined;

  const mealProtein: Record<string, number[]> = {};
  for (const d of loggedDays) {
    for (const [meal, p] of Object.entries(d.proteinByMeal)) (mealProtein[meal] ??= []).push(p);
  }
  const mealAverages = Object.entries(mealProtein)
    .filter(([, list]) => list.length >= 2)
    .map(([meal, list]) => ({ meal: meal as MealType, avg: mean(list) ?? 0 }))
    .filter((m) => m.meal !== 'snack');
  const lowestProteinMeal =
    mealAverages.length >= 2 ? mealAverages.sort((a, b) => a.avg - b.avg)[0]?.meal : undefined;

  const best = loggedDays.reduce<DailySummary | undefined>(
    (b, d) => (!b || d.intake.proteinG > b.intake.proteinG ? d : b),
    undefined,
  );

  const observations: string[] = [];
  if (sufficiency !== 'insufficient') {
    if (avgProteinG !== undefined && targets.proteinG) {
      const gap = targets.proteinG - avgProteinG;
      if (gap > 10)
        observations.push(`Protein has averaged ~${Math.round(gap)} g below your target.`);
      else observations.push('Protein has been close to your target on average.');
    }
    if (lowestProteinMeal) {
      observations.push(
        `${lowestProteinMeal[0]!.toUpperCase()}${lowestProteinMeal.slice(1)} is usually your lowest-protein meal.`,
      );
    }
    const weekend = loggedDays.filter((d) => isWeekend(d.date));
    const weekday = loggedDays.filter((d) => !isWeekend(d.date));
    const weekendCount = new Set(weekend.map((d) => d.date)).size;
    if (weekendCount >= 4 && weekday.length >= 4) {
      const we = mean(weekend.map((d) => d.intake.kcal)) ?? 0;
      const wd = mean(weekday.map((d) => d.intake.kcal)) ?? 0;
      if (wd > 0 && Math.abs(we - wd) / wd >= 0.15) {
        observations.push(
          we > wd
            ? `You tend to eat ~${Math.round(we - wd)} kcal more on weekends.`
            : `You tend to eat ~${Math.round(wd - we)} kcal less on weekends.`,
        );
      }
    }
  }

  return {
    from: range.from,
    to: range.to,
    daysLogged,
    sufficiency,
    avgKcal: avgKcal !== undefined ? Math.round(avgKcal) : undefined,
    avgProteinG: avgProteinG !== undefined ? Math.round(avgProteinG) : undefined,
    avgSteps: avgSteps !== undefined ? Math.round(avgSteps) : undefined,
    workoutSessions,
    exerciseMin,
    adherencePct,
    lowestProteinMeal,
    streakDays: loggingStreak(days, range.today),
    bestProteinDay: best
      ? { date: best.date, proteinG: Math.round(best.intake.proteinG) }
      : undefined,
    observations,
  };
}
