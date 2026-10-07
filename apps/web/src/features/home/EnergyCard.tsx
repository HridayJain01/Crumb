import { useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { approxKcal, formatRange, type DailySummary } from '@crumb/core';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Badge';

const LABEL = {
  deficit: { text: 'deficit', tone: 'teal' },
  surplus: { text: 'surplus', tone: 'primary' },
  balanced: { text: 'roughly balanced', tone: 'success' },
} as const;

/** Intake vs. estimated expenditure (BMR + steps + workouts), never "food − watch calories". */
export function EnergyCard({
  summary,
  inProgress,
}: {
  summary: DailySummary;
  inProgress: boolean;
}) {
  const [open, setOpen] = useState(false);
  const b = summary.balance;
  const label = LABEL[b.label];
  // Mid-day, intake is naturally below a full day's burn — don't call that a "deficit" yet.
  const headline = inProgress
    ? `~${approxKcal(summary.intake.kcal).replace('~', '')} in · ~${approxKcal(summary.expenditure.kcal).replace('~', '')} estimated burn today`
    : b.label === 'balanced'
      ? 'Roughly balanced'
      : `${approxKcal(Math.abs(b.kcal))} kcal ${label.text}`;
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Scale className="size-5 text-muted" aria-hidden />
          <span>
            <span className="block text-[17px] font-extrabold">Energy picture</span>
            <span className="block text-[13px] font-bold text-muted">{headline} · approximate</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Pill tone={inProgress ? 'neutral' : label.tone}>
            {inProgress ? 'In progress' : label.text}
          </Pill>
          <ChevronDown
            className={`size-5 text-muted transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <dl className="mt-4 space-y-2 text-[14px] font-bold">
          <div className="flex justify-between">
            <dt className="text-muted">Food so far</dt>
            <dd className="tabular">
              {approxKcal(summary.intake.kcal)} kcal{' '}
              <span className="text-muted">
                ({formatRange(summary.intakeRange.kcal.low, summary.intakeRange.kcal.high)})
              </span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Estimated burn today</dt>
            <dd className="tabular">
              {approxKcal(summary.expenditure.kcal)} kcal{' '}
              <span className="text-muted">
                ({formatRange(summary.expenditure.low, summary.expenditure.high)})
              </span>
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="text-muted">{inProgress ? 'Balance so far' : 'Balance'}</dt>
            <dd className="tabular">
              {b.label === 'balanced'
                ? 'roughly balanced'
                : `${approxKcal(Math.abs(b.kcal))} kcal ${inProgress && b.kcal < 0 ? 'under today’s estimated burn' : label.text}`}
            </dd>
          </div>
          <p className="pt-1 text-[12px] font-semibold text-muted">
            Burn = resting energy (BMR × 1.2 for an ordinary day) + steps beyond ~3,000 + logged
            workouts. It’s an estimate, not a measurement.
          </p>
        </dl>
      )}
    </Card>
  );
}
