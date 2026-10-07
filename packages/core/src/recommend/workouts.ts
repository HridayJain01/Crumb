import type { Goal } from '../schemas/profile';
import { exerciseNetKcal } from '../energy/energy';

/* Lightweight, equipment-free workouts (PRD §29). Energy is net kcal from the MET value. */

export interface WorkoutTemplate {
  id: string;
  title: string;
  minutes: number;
  met: number;
  focus: string;
  exercises: { name: string; prescription: string }[];
  goals: Goal[];
}

export const WORKOUTS: WorkoutTemplate[] = [
  {
    id: 'starter10',
    title: '10-minute starter',
    minutes: 10,
    met: 4.5,
    focus: 'Gentle full-body',
    goals: ['general_health', 'maintain', 'improve_fitness'],
    exercises: [
      { name: 'Marching on the spot', prescription: '2 min' },
      { name: 'Bodyweight squats', prescription: '2 × 10' },
      { name: 'Wall push-ups', prescription: '2 × 10' },
      { name: 'Standing knee raises', prescription: '2 × 12' },
      { name: 'Plank (knees ok)', prescription: '2 × 20 sec' },
    ],
  },
  {
    id: 'fullbody20',
    title: '20-minute full body',
    minutes: 20,
    met: 5,
    focus: 'Strength + a little cardio',
    goals: ['lose_fat', 'improve_fitness', 'maintain', 'general_health'],
    exercises: [
      { name: 'Bodyweight squats', prescription: '3 × 12' },
      { name: 'Push-ups', prescription: '3 × 10' },
      { name: 'Reverse lunges', prescription: '3 × 10 per leg' },
      { name: 'Glute bridges', prescription: '3 × 12' },
      { name: 'Plank', prescription: '3 × 30 sec' },
      { name: 'Rest', prescription: '60 sec between rounds' },
    ],
  },
  {
    id: 'strength30',
    title: '30-minute strength',
    minutes: 30,
    met: 5,
    focus: 'Muscle building, no equipment',
    goals: ['gain_muscle', 'improve_fitness'],
    exercises: [
      { name: 'Push-ups (slow lowering)', prescription: '4 × 8–12' },
      { name: 'Bulgarian split squats (on a chair)', prescription: '4 × 10 per leg' },
      { name: 'Pike push-ups', prescription: '3 × 8' },
      { name: 'Table rows (under a sturdy table)', prescription: '4 × 8–10' },
      { name: 'Single-leg glute bridges', prescription: '3 × 12 per leg' },
      { name: 'Side plank', prescription: '3 × 30 sec per side' },
    ],
  },
  {
    id: 'circuit25',
    title: '25-minute fat-burn circuit',
    minutes: 25,
    met: 7,
    focus: 'Higher-intensity intervals',
    goals: ['lose_fat', 'improve_fitness'],
    exercises: [
      { name: 'Jumping jacks', prescription: '40 sec on / 20 off' },
      { name: 'Squat jumps (or fast squats)', prescription: '40 sec on / 20 off' },
      { name: 'Mountain climbers', prescription: '40 sec on / 20 off' },
      { name: 'High knees', prescription: '40 sec on / 20 off' },
      { name: 'Burpees (step back ok)', prescription: '40 sec on / 20 off' },
      { name: 'Repeat', prescription: '4–5 rounds, 1 min rest between' },
    ],
  },
  {
    id: 'mobility15',
    title: '15-minute mobility',
    minutes: 15,
    met: 2.5,
    focus: 'Loosen up, recover',
    goals: ['general_health', 'maintain', 'gain_muscle', 'lose_fat', 'improve_fitness'],
    exercises: [
      { name: 'Cat–cow', prescription: '1 min' },
      { name: 'World’s greatest stretch', prescription: '5 per side' },
      { name: 'Hip flexor stretch', prescription: '45 sec per side' },
      { name: 'Thoracic rotations', prescription: '8 per side' },
      { name: 'Hamstring stretch', prescription: '45 sec per side' },
      { name: 'Child’s pose breathing', prescription: '2 min' },
    ],
  },
];

export function workoutKcal(
  w: WorkoutTemplate,
  weightKg: number,
): { kcal: number; low: number; high: number } {
  const kcal = exerciseNetKcal(w.met, weightKg, w.minutes);
  return { kcal: Math.round(kcal), low: Math.round(kcal * 0.7), high: Math.round(kcal * 1.3) };
}

/** Workouts that suit a goal, shortest first. */
export function workoutsForGoal(goal: Goal, maxMinutes = 60): WorkoutTemplate[] {
  return WORKOUTS.filter((w) => w.goals.includes(goal) && w.minutes <= maxMinutes).sort(
    (a, b) => a.minutes - b.minutes,
  );
}
