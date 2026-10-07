import type { InsightContext } from '@crumb/core';

/** Deterministic wording used whenever AI wording is unavailable or rejected. */
export function fallbackInsight(ctx: InsightContext): { insight: string; action: string } {
  const t = ctx.today;
  const action = ctx.chosenAction.text;
  if (t.mealsLogged === 0) {
    return { insight: 'Nothing logged yet today.', action };
  }
  const pct = t.kcalTarget > 0 ? Math.round((t.kcal / t.kcalTarget) * 100) : 0;
  const gap = Math.round(t.proteinTarget - t.proteinG);
  const kcalPart =
    pct > 110
      ? `You're a little above your calorie target (~${pct}%)`
      : pct >= 85
        ? "You're close to your calorie target"
        : `You're at ~${pct}% of your calorie target so far`;
  const proteinPart =
    gap > 5 ? `, with protein ~${gap} g below target.` : ' and protein is on track.';
  return { insight: `${kcalPart}${proteinPart}`, action };
}
