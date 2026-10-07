import type { Intensity, WorkoutType } from '../schemas/activity';

/*
 * MET values approximated from the 2024 Adult Compendium of Physical Activities
 * (Herrmann et al., J Sport Health Sci 2024). Net energy uses (MET − 1) so resting
 * energy (already in BMR) is never counted twice.
 */
export const MET: Record<WorkoutType, Record<Intensity, number>> = {
  walk: { light: 2.8, moderate: 3.5, vigorous: 4.8 },
  run: { light: 7.0, moderate: 8.3, vigorous: 10.5 },
  cycling: { light: 4.0, moderate: 6.8, vigorous: 9.0 },
  strength: { light: 3.0, moderate: 3.5, vigorous: 6.0 },
  yoga: { light: 2.3, moderate: 2.5, vigorous: 4.0 },
  hiit: { light: 5.5, moderate: 8.0, vigorous: 9.5 },
  swimming: { light: 5.8, moderate: 7.0, vigorous: 9.8 },
  dance: { light: 4.0, moderate: 5.0, vigorous: 7.0 },
  sports: { light: 4.5, moderate: 6.0, vigorous: 8.0 },
  other: { light: 3.0, moderate: 4.0, vigorous: 6.0 },
};

/** Typical speeds (km/h) used to convert between distance and duration. */
export const SPEED_KMH: Partial<Record<WorkoutType, Record<Intensity, number>>> = {
  walk: { light: 3.5, moderate: 5, vigorous: 6 },
  run: { light: 7, moderate: 8, vigorous: 10 },
  cycling: { light: 12, moderate: 17, vigorous: 22 },
};

export function metFor(type: WorkoutType, intensity: Intensity): number {
  return MET[type][intensity];
}
