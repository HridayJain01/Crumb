import type { Confidence } from '@crumb/core';
import type { ReactNode } from 'react';

const CONFIDENCE: Record<Confidence, { dot: string; text: string; bg: string; label: string }> = {
  high: {
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success-soft',
    label: 'High confidence',
  },
  medium: {
    dot: 'bg-[#E0A100]',
    text: 'text-warning',
    bg: 'bg-warning-soft',
    label: 'Medium confidence',
  },
  low: { dot: 'bg-danger', text: 'text-danger', bg: 'bg-danger-soft', label: 'Low confidence' },
};

/** Never colour-only: a dot, a word and an accessible label (PRD §13, §19). */
export function ConfidenceBadge({ level, compact }: { level: Confidence; compact?: boolean }) {
  const c = CONFIDENCE[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip ${c.bg} px-2 py-0.5 text-[12px] font-extrabold ${c.text}`}
      title={`${c.label} — this is an estimate`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} aria-hidden />
      {compact ? level[0]!.toUpperCase() + level.slice(1) : c.label}
    </span>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'teal' | 'primary';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    teal: 'bg-teal-soft text-teal',
    primary: 'bg-primary-soft text-primary-ink',
  } as const;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2.5 py-1 text-[12px] font-extrabold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
