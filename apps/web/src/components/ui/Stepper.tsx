import { Minus, Plus } from 'lucide-react';

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Thumb-friendly −/+ control: editing amounts should never need the keyboard.
 * Whole steps above 1, quarter steps below 1 (½ roti, ¾ bowl).
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0.25,
  max = 50,
  label,
  format = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
  format?: (v: number) => string;
}) {
  const dec = () =>
    onChange(Math.max(min, round(value > 1 ? Math.max(1, value - step) : value - 0.25)));
  const inc = () => onChange(Math.min(max, round(value < 1 ? value + 0.25 : value + step)));
  return (
    <div
      className="inline-flex items-center rounded-chip bg-surface-2"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label={`Less ${label}`}
        className="flex size-9 items-center justify-center rounded-full text-ink transition active:scale-90 disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-8 text-center text-[15px] font-extrabold tabular" aria-live="polite">
        {format(value)}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label={`More ${label}`}
        className="flex size-9 items-center justify-center rounded-full text-ink transition active:scale-90 disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
