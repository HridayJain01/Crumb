import { z } from 'zod';
import { ConfidenceSchema, DateKeySchema, RangeSchema } from './common';

export const ACTIVITY_TYPES = [
  'walk',
  'run',
  'cycling',
  'strength',
  'yoga',
  'hiit',
  'swimming',
  'dance',
  'sports',
  'other',
  'steps',
] as const;
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type WorkoutType = Exclude<ActivityType, 'steps'>;

export const IntensitySchema = z.enum(['light', 'moderate', 'vigorous']);
export type Intensity = z.infer<typeof IntensitySchema>;

export const ActivitySourceSchema = z.enum(['manual', 'google_health', 'webhook']);
export type ActivitySource = z.infer<typeof ActivitySourceSchema>;

export const ActivitySchema = z.object({
  date: DateKeySchema,
  startedAt: z.string(),
  type: ActivityTypeSchema,
  label: z.string().min(1).max(60),
  durationMin: z.number().min(0).max(1440).optional(),
  distanceKm: z.number().min(0).max(300).optional(),
  steps: z.number().int().min(0).max(150000).optional(),
  /** Net "extra" kcal above resting. Never includes BMR. */
  kcal: z.number().min(0).max(5000),
  range: RangeSchema,
  met: z.number().min(1).max(25).optional(),
  intensity: IntensitySchema.optional(),
  source: ActivitySourceSchema,
  confidence: ConfidenceSchema,
  externalId: z.string().max(120).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Activity = z.infer<typeof ActivitySchema>;
export type ActivityWithId = Activity & { id: string };
