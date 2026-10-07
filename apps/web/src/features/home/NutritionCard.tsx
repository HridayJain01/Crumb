import { approxKcal, formatRange, type DailySummary, type Targets } from '@crumb/core';
import { Card } from '../../components/ui/Card';
import { MacroBar, ProgressRing } from '../../components/ui/Progress';
import { Pill } from '../../components/ui/Badge';

function status(
  value: number,
  target: number,
  today: boolean,
): { tone: 'success' | 'warning' | 'neutral'; label: string } {
  if (!value) return { tone: 'neutral', label: today ? 'Nothing yet' : 'Not logged' };
  const r = value / target;
  if (r > 1.15) return { tone: 'warning', label: '▲ A bit over' };
  if (r >= 0.85) return { tone: 'success', label: '✓ Close to target' };
  return { tone: 'neutral', label: today ? 'In progress' : 'Below target' };
}

/** "How am I doing today?" — calories ring + macro bars, always shown as approximate. */
export function NutritionCard({
  summary,
  targets,
  isToday,
}: {
  summary: DailySummary;
  targets: Targets;
  isToday: boolean;
}) {
  const kcal = summary.intake.kcal;
  const s = status(kcal, targets.kcal, isToday);
  const remaining = Math.max(0, targets.kcal - kcal);
  return (
    <Card>
      <div className="flex items-center gap-4">
        <ProgressRing
          value={kcal}
          target={targets.kcal}
          label={`About ${Math.round(kcal)} of ${targets.kcal} kilocalories`}
        >
          <span className="text-[26px] font-black leading-none tabular">
            {approxKcal(kcal).replace('~', '')}
          </span>
          <span className="mt-0.5 text-[12px] font-extrabold text-muted">
            of ~{targets.kcal.toLocaleString('en-IN')}
          </span>
          <span className="text-[11px] font-bold text-muted">kcal</span>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-extrabold">Calories</h2>
            <Pill tone={s.tone}>{s.label}</Pill>
          </div>
          <MacroBar
            label="Protein"
            value={summary.intake.proteinG}
            target={targets.proteinG}
            color="var(--color-protein)"
            emphasis
          />
          <MacroBar
            label="Carbs"
            value={summary.intake.carbsG}
            target={targets.carbsG}
            color="var(--color-carbs)"
          />
          <MacroBar
            label="Fat"
            value={summary.intake.fatG}
            target={targets.fatG}
            color="var(--color-fat)"
          />
        </div>
      </div>
      {kcal > 0 && (
        <p className="mt-3 text-[13px] font-semibold text-muted">
          Range ~{formatRange(summary.intakeRange.kcal.low, summary.intakeRange.kcal.high)} kcal
          {remaining > 0
            ? ` · about ${approxKcal(remaining).replace('~', '')} kcal ${isToday ? 'of room left' : 'below target'}`
            : ''}
        </p>
      )}
    </Card>
  );
}
