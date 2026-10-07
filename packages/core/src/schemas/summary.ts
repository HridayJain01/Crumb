import { z } from 'zod';
import { DateKeySchema, NutrientsSchema, RangeSchema } from './common';

export const BalanceLabelSchema = z.enum(['deficit', 'surplus', 'balanced']);
export type BalanceLabel = z.infer<typeof BalanceLabelSchema>;

export const EstimateSchema = z.object({
  kcal: z.number(),
  low: z.number(),
  high: z.number(),
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const DailySummarySchema = z.object({
  date: DateKeySchema,
  intake: NutrientsSchema,
  intakeRange: z.object({ kcal: RangeSchema, proteinG: RangeSchema }),
  mealsLogged: z.number().int().min(0),
  proteinByMeal: z.record(z.string(), z.number()),
  steps: z.number().int().min(0),
  stepsSource: z.enum(['device', 'manual', 'none']),
  /** Net kcal from steps and workouts (or device active energy). */
  activeKcal: z.number().min(0),
  exerciseMin: z.number().min(0),
  strengthSessions: z.number().int().min(0),
  expenditure: EstimateSchema,
  balance: EstimateSchema.extend({ label: BalanceLabelSchema }),
  engineVersion: z.number().int(),
  updatedAt: z.string(),
});
export type DailySummary = z.infer<typeof DailySummarySchema>;
