import type { ReactNode } from 'react';

/** Calorie ring. Overshoot wraps in a darker tone instead of turning red (no guilt UX). */
export function ProgressRing({
  value,
  target,
  size = 132,
  stroke = 12,
  color = 'var(--color-kcal)',
  children,
  label,
}: {
  value: number;
  target: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? value / target : 0;
  const main = Math.min(ratio, 1);
  const over = Math.min(Math.max(ratio - 1, 0), 1);
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * main} ${c}`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.2,0.8,0.2,1)' }}
        />
        {over > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-primary-strong)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * over} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

export function MacroBar({
  label,
  value,
  target,
  unit = 'g',
  color,
  emphasis,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  color: string;
  emphasis?: boolean;
}) {
  const pctValue = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={`text-[13px] font-bold ${emphasis ? 'text-ink' : 'text-muted'}`}>
          {label}
        </span>
        <span className="text-[13px] font-bold tabular text-ink">
          {Math.round(value)}
          <span className="text-muted">
            {' '}
            / ~{Math.round(target)} {unit}
          </span>
        </span>
      </div>
      <div
        className={`${emphasis ? 'h-3' : 'h-2'} overflow-hidden rounded-full bg-surface-2`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pctValue}%`,
            background: color,
            transition: 'width 600ms cubic-bezier(0.2,0.8,0.2,1)',
          }}
        />
      </div>
    </div>
  );
}
