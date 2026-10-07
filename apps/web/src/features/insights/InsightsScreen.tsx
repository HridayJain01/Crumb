import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Footprints, Sparkles, Trophy } from 'lucide-react';
import {
  addDays,
  approxKcal,
  dateRange,
  MEAL_LABEL,
  periodStats,
  shortDateLabel,
  SUFFICIENCY_LABEL,
  type DailySummary,
} from '@crumb/core';
import { useProfile } from '../../data/user';
import { useDays } from '../../data/day';
import { useMemory, useTemplates } from '../../data/memory';
import { deleteTemplate } from '../../data/mutations';
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { todayKey, weekdayShort } from '../../lib/time';
import { BarChart } from './BarChart';
import { WalkPlanner } from './WalkPlanner';
import { WorkoutList } from './Workouts';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-[22px] font-black tabular">{value}</p>
      {sub && <p className="text-[12px] font-bold text-muted">{sub}</p>}
    </div>
  );
}

export default function InsightsScreen() {
  const { uid, profile, targets } = useProfile();
  const today = todayKey(profile.timezone);
  const [params, setParams] = useSearchParams();
  const walkParam = params.get('walk');
  const [walkOpen, setWalkOpen] = useState(walkParam !== null);
  const from = addDays(today, -6);
  const week = useDays(uid, addDays(today, -29), today);
  const memory = useMemory(uid);
  const { templates } = useTemplates(uid);

  // Averages and adherence use complete days only; today is still in progress.
  const stats = useMemo(
    () => periodStats(week.data, targets, { from, to: addDays(today, -1), today }),
    [week.data, targets, from, today],
  );
  const loggedThisWeek = week.data.filter((d) => d.date >= from && d.mealsLogged > 0).length;
  const month = useMemo(
    () => periodStats(week.data, targets, { from: addDays(today, -29), to: today, today }),
    [week.data, targets, today],
  );
  const byDate = useMemo(
    () => new Map(week.data.map((d) => [d.date, d] as [string, DailySummary])),
    [week.data],
  );
  const days = dateRange(from, today);
  const chartDays = days.map((d) => ({ date: d, summary: byDate.get(d), label: weekdayShort(d) }));
  const stepDays = chartDays.filter((c) => c.summary && c.summary.steps > 0).length;

  return (
    <div className="space-y-3 pb-6">
      <header className="pt-2">
        <h1 className="text-[28px] font-black tracking-tight">This week</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Pill tone={stats.sufficiency === 'insufficient' ? 'neutral' : 'teal'}>
            {SUFFICIENCY_LABEL[stats.sufficiency]}
          </Pill>
          <span className="text-[13px] font-bold text-muted">
            {loggedThisWeek} of 7 days logged
          </span>
        </div>
      </header>

      {loggedThisWeek === 0 ? (
        <Card>
          <EmptyState
            mood="sleepy"
            title="Your week will show up here"
            body="Log a few meals and some activity — patterns appear after about 3 days."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Avg calories"
              value={stats.avgKcal ? approxKcal(stats.avgKcal) : '—'}
              sub={`target ~${targets.kcal.toLocaleString('en-IN')}`}
            />
            <Stat
              label="Avg protein"
              value={stats.avgProteinG ? `~${stats.avgProteinG} g` : '—'}
              sub={`target ~${targets.proteinG} g`}
            />
            <Stat
              label="Avg steps"
              value={stats.avgSteps ? stats.avgSteps.toLocaleString('en-IN') : '—'}
              sub={stats.avgSteps ? 'on days with data' : 'add steps daily'}
            />
            <Stat
              label="On target"
              value={
                stats.sufficiency !== 'insufficient' && stats.adherencePct !== undefined
                  ? `${stats.adherencePct}%`
                  : '—'
              }
              sub={stats.sufficiency === 'insufficient' ? 'after 3 full days' : 'of full days'}
            />
          </div>

          <Card>
            <CardHeader title="Are you hitting protein?" subtitle="Grams per day vs. your target" />
            <BarChart
              title="Protein per day"
              color="var(--color-protein)"
              reference={targets.proteinG}
              referenceLabel={`target ${targets.proteinG} g`}
              data={chartDays.map((c) => ({
                label: c.label,
                value: c.summary && c.summary.mealsLogged ? c.summary.intake.proteinG : null,
                highlight: c.date === today,
              }))}
            />
          </Card>

          <Card>
            <CardHeader title="How much are you moving?" subtitle="Steps per day" />
            <BarChart
              title="Steps per day"
              color="var(--color-teal)"
              reference={stepDays >= 2 ? stats.avgSteps : undefined}
              referenceLabel={
                stats.avgSteps ? `avg ${stats.avgSteps.toLocaleString('en-IN')}` : undefined
              }
              format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
              data={chartDays.map((c) => ({
                label: c.label,
                value: c.summary && c.summary.steps ? c.summary.steps : null,
                highlight: c.date === today,
              }))}
            />
          </Card>

          <Card tone="warm">
            <CardHeader title="What we’re noticing" icon={<Sparkles className="size-5" />} />
            {stats.observations.length ? (
              <ul className="space-y-2">
                {stats.observations.map((o) => (
                  <li key={o} className="text-[15px] font-bold">
                    • {o}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] font-bold text-muted">
                Not enough data yet — after 3 logged days we’ll start pointing out patterns, gently.
              </p>
            )}
            {month.daysLogged >= 14 && month.observations[0] && (
              <p className="mt-3 text-[13px] font-semibold text-muted">
                Over 30 days ({SUFFICIENCY_LABEL[month.sufficiency].toLowerCase()}):{' '}
                {month.observations[0]}
              </p>
            )}
          </Card>

          <div className="flex flex-wrap gap-2">
            {stats.streakDays > 1 && (
              <Pill tone="primary">🔥 {stats.streakDays}-day logging streak</Pill>
            )}
            {month.daysLogged >= 7 && month.bestProteinDay && month.bestProteinDay.proteinG > 0 && (
              <Pill tone="teal">
                <Trophy className="size-3.5" aria-hidden /> Best protein day:{' '}
                {month.bestProteinDay.proteinG} g ({shortDateLabel(month.bestProteinDay.date)})
              </Pill>
            )}
            {stats.lowestProteinMeal && (
              <Pill>Lowest-protein meal: {MEAL_LABEL[stats.lowestProteinMeal]}</Pill>
            )}
          </div>
        </>
      )}

      <SectionTitle>Move more</SectionTitle>
      <Card tone="teal">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-surface text-teal">
            <Footprints className="size-6" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[16px] font-extrabold text-teal">Walking loops near you</p>
            <p className="text-[13px] font-bold text-teal/80">
              Pick minutes or calories — we’ll map a loop.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setWalkOpen(true)}>
            Plan
          </Button>
        </div>
      </Card>
      <WorkoutList uid={uid} profile={profile} initialId={params.get('workout')} />

      {templates.length > 0 && (
        <>
          <SectionTitle>Your usual meals</SectionTitle>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-2xl bg-surface p-3 shadow-card"
              >
                <span>
                  <span className="block text-[15px] font-extrabold">{t.label}</span>
                  <span className="block text-[12px] font-bold text-muted">
                    {t.items.map((i) => i.name).join(' + ')} · used {t.count}×
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => deleteTemplate(uid, t.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {memory.list.length > 0 && (
        <p className="px-1 pt-2 text-[12px] font-semibold text-muted">
          Crumb remembers {memory.list.length} of your foods and your usual portions, so estimates
          get more personal over time.
        </p>
      )}

      <WalkPlanner
        open={walkOpen}
        onClose={() => {
          setWalkOpen(false);
          if (walkParam !== null) setParams({}, { replace: true });
        }}
        profile={profile}
        initialMinutes={walkParam ? Math.min(120, Math.max(10, Number(walkParam) || 30)) : 30}
      />
    </div>
  );
}
