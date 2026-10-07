/* Display helpers: approximate values are always shown rounded and with "~" (PRD §5.2). */

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/** Rounding step that keeps estimates from looking falsely precise. */
export function kcalStep(n: number): number {
  if (n < 100) return 5;
  if (n < 1000) return 10;
  return 50;
}

export function approxKcal(n: number): string {
  const step = kcalStep(Math.abs(n));
  return `~${formatNumber(Math.round(n / step) * step)}`;
}

export function approxGrams(n: number): string {
  return n < 10 ? `~${Math.round(n * 10) / 10}` : `~${Math.round(n)}`;
}

/** "190–350" with the low end rounded down and the high end rounded up. */
export function formatRange(low: number, high: number, step = kcalStep(high)): string {
  const lo = Math.max(0, Math.floor(low / step) * step);
  const hi = Math.ceil(high / step) * step;
  if (lo === hi) return formatNumber(lo);
  return `${formatNumber(lo)}–${formatNumber(hi)}`;
}

export function pct(value: number, target: number): number {
  if (!target) return 0;
  return Math.max(0, Math.round((value / target) * 100));
}
