import { z } from 'zod';
import { MealTypeSchema } from './common';
import { DietSchema, GoalSchema } from './profile';
import { AiActivityInterpretationSchema, AiMealInterpretationSchema } from './ai';

/** Labels of the user's frequent foods/meals, so the model can resolve "my usual shake". */
export const MemoryHintSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  usual: z.string().max(60),
});
export type MemoryHint = z.infer<typeof MemoryHintSchema>;

export const InterpretMealRequestSchema = z
  .object({
    text: z.string().trim().max(1000).optional(),
    /** Base64 JPEG/PNG/WebP without the data: prefix; ~1.5 MB binary max. */
    imageBase64: z.string().max(2_100_000).optional(),
    imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
    /** Local wall-clock time, e.g. "2026-10-07T13:20". */
    localTime: z.string().max(40),
    timezone: z.string().max(64),
    mealTypeHint: MealTypeSchema.optional(),
    diet: DietSchema.optional(),
    memoryHints: z.array(MemoryHintSchema).max(15).default([]),
  })
  .refine((r) => Boolean(r.text?.length) || Boolean(r.imageBase64), {
    message: 'Provide text or a photo',
  });
export type InterpretMealRequest = z.input<typeof InterpretMealRequestSchema>;

export const InterpretMealResponseSchema = z.object({
  interpretation: AiMealInterpretationSchema,
  model: z.string(),
  latencyMs: z.number(),
});
export type InterpretMealResponse = z.infer<typeof InterpretMealResponseSchema>;

export const InterpretActivityRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
});
export type InterpretActivityRequest = z.infer<typeof InterpretActivityRequestSchema>;

export const InterpretActivityResponseSchema = z.object({
  interpretation: AiActivityInterpretationSchema,
  model: z.string(),
});
export type InterpretActivityResponse = z.infer<typeof InterpretActivityResponseSchema>;

/** Structured statistics only (PRD §34) — never raw logs. */
export const InsightContextSchema = z.object({
  goal: GoalSchema,
  diet: DietSchema,
  localHour: z.number().min(0).max(23),
  today: z.object({
    kcal: z.number(),
    kcalTarget: z.number(),
    proteinG: z.number(),
    proteinTarget: z.number(),
    steps: z.number(),
    mealsLogged: z.number(),
    balanceLabel: z.enum(['deficit', 'surplus', 'balanced']).optional(),
  }),
  recent: z
    .object({
      daysLogged: z.number(),
      avgKcal: z.number().optional(),
      avgProteinG: z.number().optional(),
      avgSteps: z.number().optional(),
      lowestProteinMeal: MealTypeSchema.optional(),
    })
    .optional(),
  commonFoods: z.array(z.string().max(40)).max(10).default([]),
  /** The deterministic rules engine's chosen action; the model only words it. */
  chosenAction: z.object({
    kind: z.string().max(40),
    text: z.string().max(200),
  }),
});
export type InsightContext = z.input<typeof InsightContextSchema>;

export const InsightRequestSchema = z.object({
  kind: z.enum(['daily', 'weekly', 'tomorrow']),
  context: InsightContextSchema,
});
export type InsightRequest = z.input<typeof InsightRequestSchema>;

export const InsightResponseSchema = z.object({
  insight: z.string(),
  action: z.string(),
  source: z.enum(['ai', 'template']),
});
export type InsightResponse = z.infer<typeof InsightResponseSchema>;

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

export const PaceSchema = z.enum(['easy', 'normal', 'brisk']);
export type Pace = z.infer<typeof PaceSchema>;

export const WalkRoutesRequestSchema = z
  .object({
    origin: LatLngSchema,
    targetKcal: z.number().min(20).max(1500).optional(),
    targetMin: z.number().min(5).max(240).optional(),
    weightKg: z.number().min(30).max(300),
    pace: PaceSchema.default('normal'),
  })
  .refine((r) => r.targetKcal !== undefined || r.targetMin !== undefined, {
    message: 'Provide targetKcal or targetMin',
  });
export type WalkRoutesRequest = z.input<typeof WalkRoutesRequestSchema>;

export const RouteOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
  kcal: z.object({ estimate: z.number(), low: z.number(), high: z.number() }),
  origin: LatLngSchema,
  waypoints: z.array(LatLngSchema),
  polyline: z.string().optional(),
  mapsUrl: z.string(),
  warnings: z.array(z.string()),
  measured: z.boolean(),
});
export type RouteOption = z.infer<typeof RouteOptionSchema>;

export const WalkRoutesResponseSchema = z.object({
  options: z.array(RouteOptionSchema),
  targetKm: z.number(),
  disclaimer: z.string(),
});
export type WalkRoutesResponse = z.infer<typeof WalkRoutesResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthSyncRequestSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().max(64),
});
export type HealthSyncRequest = z.infer<typeof HealthSyncRequestSchema>;

export const HealthSyncResponseSchema = z.object({
  changedDates: z.array(z.string()),
  imported: z.number(),
});
export type HealthSyncResponse = z.infer<typeof HealthSyncResponseSchema>;
