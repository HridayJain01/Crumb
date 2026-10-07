import { z } from 'zod';
import {
  ConfidenceSchema,
  MealTypeSchema,
  OilLevelSchema,
  SettingSchema,
  UnitSchema,
} from './common';
import { IntensitySchema } from './activity';

/*
 * Wire schemas for what Gemini must return. They intentionally contain NO totals:
 * the model interprets, application code calculates (PRD §35, §61).
 */

export const AiPer100gSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});
export type AiPer100g = z.infer<typeof AiPer100gSchema>;

export const AiFoodItemSchema = z.object({
  name: z.string().min(1).max(80).describe('Food as the user would call it, e.g. "aloo sabzi"'),
  canonicalName: z.string().min(1).max(80).describe('Generic English name, e.g. "potato curry"'),
  quantity: z.number().describe('Count in the given unit, e.g. 2 for "two rotis"'),
  unit: UnitSchema,
  quantityStated: z.boolean().describe('true only if the user explicitly said the amount'),
  estimatedGrams: z
    .number()
    .nullable()
    .describe('Estimated total grams for the whole quantity, or null'),
  preparation: z.string().max(80).nullable(),
  oilLevel: OilLevelSchema,
  setting: SettingSchema,
  identification: ConfidenceSchema.describe('How sure you are about WHAT the food is'),
  alternatives: z
    .array(z.string().max(60))
    .max(3)
    .describe('Up to 3 likely specific variants when the food is ambiguous'),
  per100g: AiPer100gSchema.nullable().describe(
    'Approximate nutrition per 100 g as prepared; only a fallback when no database match exists',
  ),
  memoryRef: z
    .string()
    .max(60)
    .nullable()
    .describe('Key of the user\'s saved food/meal if they referred to it ("my usual shake")'),
});
export type AiFoodItem = z.infer<typeof AiFoodItemSchema>;

export const AiMealSchema = z.object({
  mealType: MealTypeSchema.nullable(),
  items: z.array(AiFoodItemSchema).max(20),
});
export type AiMeal = z.infer<typeof AiMealSchema>;

export const ImageIssueSchema = z.enum(['none', 'blurry', 'dark', 'too_close', 'partial']);

export const AiMealInterpretationSchema = z.object({
  status: z.enum(['ok', 'not_food', 'unclear_image']),
  imageIssue: ImageIssueSchema.nullable(),
  meals: z.array(AiMealSchema).max(4),
  clarifyingQuestion: z.string().max(200).nullable(),
});
export type AiMealInterpretation = z.infer<typeof AiMealInterpretationSchema>;

export const AiActivitySchema = z.object({
  type: z.enum([
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
  ]),
  label: z.string().min(1).max(60),
  durationMin: z.number().nullable(),
  distanceKm: z.number().nullable(),
  steps: z.number().nullable(),
  intensity: IntensitySchema,
});
export type AiActivity = z.infer<typeof AiActivitySchema>;

export const AiActivityInterpretationSchema = z.object({
  activities: z.array(AiActivitySchema).max(6),
});
export type AiActivityInterpretation = z.infer<typeof AiActivityInterpretationSchema>;

export const AiInsightSchema = z.object({
  insight: z.string().min(1).max(240),
  action: z.string().min(1).max(160),
});
export type AiInsight = z.infer<typeof AiInsightSchema>;
