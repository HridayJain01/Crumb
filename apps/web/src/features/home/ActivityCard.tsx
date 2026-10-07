import { useState } from 'react';
import { Footprints, Plus, Trash2, Watch } from 'lucide-react';
import {
  approxKcal,
  formatRange,
  type ActivityWithId,
  type DailySummary,
  type Profile,
} from '@crumb/core';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { deleteActivity } from '../../data/mutations';
import { StepsSheet, WorkoutSheet } from '../activity/ActivitySheets';

export function ActivityCard({
  uid,
  date,
  profile,
  summary,
  activities,
}: {
  uid: string;
  date: string;
  profile: Profile;
  summary: DailySummary;
  activities: ActivityWithId[];
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const workouts = activities.filter((a) => a.type !== 'steps');
  return (
    <Card>
      <CardHeader
        title="Activity"
        icon={<Footprints className="size-5" />}
        action={
          summary.stepsSource === 'device' ? (
            <Pill tone="teal">
              <Watch className="size-3.5" aria-hidden /> Synced
            </Pill>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setStepsOpen(true)}
          className="rounded-2xl bg-surface-2 p-3 text-left transition active:scale-[0.98]"
          aria-label={`Steps today: ${summary.steps}. Tap to update.`}
        >
          <span className="block text-[26px] font-black leading-none tabular">
            {summary.steps ? summary.steps.toLocaleString('en-IN') : '—'}
          </span>
          <span className="mt-1 block text-[13px] font-bold text-muted">
            {summary.steps ? 'steps' : 'Add steps'}
          </span>
        </button>
        <div className="rounded-2xl bg-teal-soft p-3">
          <span className="block text-[26px] font-black leading-none text-teal tabular">
            {summary.activeKcal > 0 ? approxKcal(summary.activeKcal) : '—'}
          </span>
          <span className="mt-1 block text-[13px] font-bold text-teal">extra kcal moved</span>
        </div>
      </div>
      {workouts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {workouts.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-xl px-1 py-1">
              <span className="text-[14px] font-extrabold">
                {w.label}
                <span className="font-bold text-muted">
                  {' '}
                  · {w.durationMin ?? '?'} min · ~{formatRange(w.range.low, w.range.high)} kcal
                </span>
              </span>
              {w.source === 'manual' && (
                <button
                  type="button"
                  aria-label={`Delete ${w.label}`}
                  onClick={() => deleteActivity(uid, w.id)}
                  className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="soft"
          icon={<Plus className="size-4" />}
          onClick={() => setWorkoutOpen(true)}
        >
          Workout
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setStepsOpen(true)}>
          Update steps
        </Button>
      </div>
      <StepsSheet
        open={stepsOpen}
        onClose={() => setStepsOpen(false)}
        uid={uid}
        date={date}
        profile={profile}
        current={summary.stepsSource === 'manual' ? summary.steps : 0}
      />
      <WorkoutSheet
        open={workoutOpen}
        onClose={() => setWorkoutOpen(false)}
        uid={uid}
        date={date}
        profile={profile}
      />
    </Card>
  );
}
