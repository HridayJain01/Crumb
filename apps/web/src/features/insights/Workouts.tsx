import { useState } from 'react';
import { Check, Dumbbell } from 'lucide-react';
import {
  formatRange,
  workoutKcal,
  workoutsForGoal,
  WORKOUTS,
  type Profile,
  type WorkoutTemplate,
} from '@crumb/core';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { addWorkout, deleteActivity } from '../../data/mutations';
import { todayKey } from '../../lib/time';

export function WorkoutTemplateSheet({
  workout,
  onClose,
  uid,
  profile,
}: {
  workout: WorkoutTemplate | null;
  onClose: () => void;
  uid: string;
  profile: Profile;
}) {
  const toast = useToast();
  if (!workout) return null;
  const k = workoutKcal(workout, profile.weightKg);
  const type =
    workout.id === 'mobility15' ? 'yoga' : workout.id === 'circuit25' ? 'hiit' : 'strength';
  return (
    <Sheet
      open={Boolean(workout)}
      onOpenChange={(o) => !o && onClose()}
      title={workout.title}
      description={`${workout.focus} · ~${formatRange(k.low, k.high)} extra kcal`}
      footer={
        <Button
          size="lg"
          block
          icon={<Check className="size-5" strokeWidth={3} />}
          onClick={() => {
            const id = addWorkout(uid, todayKey(profile.timezone), {
              type,
              label: workout.title,
              intensity: workout.met >= 6 ? 'vigorous' : 'moderate',
              durationMin: workout.minutes,
              kcal: k.kcal,
              low: k.low,
              high: k.high,
              met: workout.met,
              confidence: 'medium',
            });
            toast({
              message: `Nice work! ${workout.title} logged.`,
              action: { label: 'Undo', onClick: () => deleteActivity(uid, id) },
            });
            onClose();
          }}
        >
          Done — log it
        </Button>
      }
    >
      <ol className="space-y-2">
        {workout.exercises.map((e, i) => (
          <li
            key={e.name}
            className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[14px] font-black text-primary-ink">
              {i + 1}
            </span>
            <span className="flex-1 text-[15px] font-extrabold">{e.name}</span>
            <span className="text-[14px] font-bold text-muted">{e.prescription}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] font-semibold text-muted">
        Go at your own pace and stop if anything hurts. Not medical advice.
      </p>
    </Sheet>
  );
}

export function WorkoutList({
  uid,
  profile,
  initialId,
}: {
  uid: string;
  profile: Profile;
  initialId?: string | null;
}) {
  const [active, setActive] = useState<WorkoutTemplate | null>(
    () => WORKOUTS.find((w) => w.id === initialId) ?? null,
  );
  const list = workoutsForGoal(profile.goal);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {list.map((w) => {
          const k = workoutKcal(w, profile.weightKg);
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setActive(w)}
              className="rounded-card bg-surface p-3 text-left shadow-card transition active:scale-[0.98]"
            >
              <Dumbbell className="size-5 text-primary" aria-hidden />
              <span className="mt-1 block text-[15px] font-extrabold leading-tight">{w.title}</span>
              <span className="block text-[12px] font-bold text-muted">
                {w.focus} · ~{formatRange(k.low, k.high)} kcal
              </span>
            </button>
          );
        })}
      </div>
      <WorkoutTemplateSheet
        workout={active}
        onClose={() => setActive(null)}
        uid={uid}
        profile={profile}
      />
    </>
  );
}
