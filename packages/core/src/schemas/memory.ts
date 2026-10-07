import { z } from 'zod';
import { MealTypeSchema, NutrientsSchema, UnitSchema } from './common';
import { FoodItemSchema } from './food';

export const FoodMemorySchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  foodId: z.string().max(60).nullable(),
  emoji: z.string().max(8),
  count: z.number().int().min(0),
  lastUsed: z.string(),
  typicalUnit: UnitSchema,
  typicalQuantity: z.number().positive(),
  /** Exponential moving average of accepted grams per unit, keyed by unit. */
  gramsPerUnit: z.record(z.string(), z.number().positive()),
  per100g: NutrientsSchema,
  mealTypeCounts: z.record(z.string(), z.number().int().min(0)),
  corrections: z.number().int().min(0),
});
export type FoodMemory = z.infer<typeof FoodMemorySchema>;

export const MealTemplateSchema = z.object({
  label: z.string().min(1).max(60),
  signature: z.string().max(600),
  mealType: MealTypeSchema,
  items: z.array(FoodItemSchema).max(30),
  count: z.number().int().min(0),
  typicalHour: z.number().min(0).max(23),
  lastUsed: z.string(),
  source: z.enum(['auto', 'user']),
});
export type MealTemplate = z.infer<typeof MealTemplateSchema>;
export type MealTemplateWithId = MealTemplate & { id: string };

export const CorrectionSchema = z.object({
  entryId: z.string().max(60),
  itemName: z.string().max(80),
  field: z.enum(['grams', 'quantity', 'unit', 'food', 'removed']),
  aiValue: z.string().max(80),
  userValue: z.string().max(80),
  createdAt: z.string(),
});
export type Correction = z.infer<typeof CorrectionSchema>;
