import { z } from 'zod';
import {
  ConfidenceSchema,
  DateKeySchema,
  MealTypeSchema,
  NutrientsSchema,
  OilLevelSchema,
  RangeSchema,
  SettingSchema,
  UnitSchema,
} from './common';

export const InputTypeSchema = z.enum(['photo', 'text', 'voice', 'manual', 'quick']);
export type InputType = z.infer<typeof InputTypeSchema>;

/** Where the gram weight of an item came from (provenance, shown to the user). */
export const GramsSourceSchema = z.enum(['user', 'memory', 'db_unit', 'ai_estimate', 'generic']);
export type GramsSource = z.infer<typeof GramsSourceSchema>;

/** Where the nutrition density (per 100 g) of an item came from. */
export const NutritionSourceSchema = z.enum([
  'curated_db',
  'usda_db',
  'memory',
  'ai_estimate',
  'none',
]);
export type NutritionSource = z.infer<typeof NutritionSourceSchema>;

export const QuantityOriginSchema = z.enum([
  'user_grams',
  'memory',
  'stated_food_unit',
  'stated_generic_unit',
  'ai_text',
  'ai_photo',
]);
export type QuantityOrigin = z.infer<typeof QuantityOriginSchema>;

export const NutritionOriginSchema = z.enum(['usda', 'curated', 'memory', 'ai', 'none']);
export type NutritionOrigin = z.infer<typeof NutritionOriginSchema>;

export const PrepCertaintySchema = z.enum(['n/a', 'known', 'unknown', 'restaurant']);
export type PrepCertainty = z.infer<typeof PrepCertaintySchema>;

/**
 * Everything needed to recompute an item deterministically after an edit,
 * without the food database (so AI-estimated foods can be edited too).
 */
export const ItemBasisSchema = z.object({
  per100g: NutrientsSchema,
  /** Multiplier applied to fat grams for oil-sensitive dishes (1 = as listed). */
  fatFactor: z.number().min(0).max(3),
  gramsPerUnit: z.number().positive().max(5000),
  idConfidence: ConfidenceSchema,
  userChoseFood: z.boolean(),
  quantityOrigin: QuantityOriginSchema,
  nutritionOrigin: NutritionOriginSchema,
  prep: PrepCertaintySchema,
});
export type ItemBasis = z.infer<typeof ItemBasisSchema>;

export const FoodItemSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  foodId: z.string().max(60).nullable(),
  emoji: z.string().max(8),
  quantity: z.number().positive().max(100),
  unit: UnitSchema,
  grams: z.number().min(0).max(5000),
  gramsSource: GramsSourceSchema,
  nutrition: NutrientsSchema,
  range: z.object({ kcal: RangeSchema, proteinG: RangeSchema }),
  sigma: z.number().min(0).max(3),
  confidence: ConfidenceSchema,
  source: NutritionSourceSchema,
  assumptions: z.array(z.string().max(140)).max(6),
  basis: ItemBasisSchema,
  needsInput: z.boolean(),
  oilLevel: OilLevelSchema.optional(),
  setting: SettingSchema.optional(),
  alternatives: z.array(z.string().max(60)).max(3).optional(),
  aiOriginal: z
    .object({
      name: z.string().max(80),
      quantity: z.number(),
      unit: UnitSchema,
      grams: z.number(),
    })
    .optional(),
});
export type FoodItem = z.infer<typeof FoodItemSchema>;

export const TotalsSchema = z.object({
  nutrition: NutrientsSchema,
  kcal: RangeSchema,
  proteinG: RangeSchema,
});
export type Totals = z.infer<typeof TotalsSchema>;

export const EntryStatusSchema = z.enum(['confirmed', 'pending_ai']);
export type EntryStatus = z.infer<typeof EntryStatusSchema>;

export const FoodEntrySchema = z.object({
  date: DateKeySchema,
  /** ISO-8601 UTC timestamp; sorts lexicographically. */
  loggedAt: z.string(),
  mealType: MealTypeSchema,
  inputType: InputTypeSchema,
  rawInput: z.string().max(1000).optional(),
  /** Small JPEG data URL for the timeline. Original photos are never stored. */
  thumb: z.string().max(40000).optional(),
  status: EntryStatusSchema,
  items: z.array(FoodItemSchema).max(30),
  totals: TotalsSchema,
  aiModel: z.string().max(60).optional(),
  templateId: z.string().max(60).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FoodEntry = z.infer<typeof FoodEntrySchema>;
export type FoodEntryWithId = FoodEntry & { id: string };

export const MealDraftSchema = z.object({
  mealType: MealTypeSchema,
  items: z.array(FoodItemSchema).max(30),
});
export type MealDraft = z.infer<typeof MealDraftSchema>;
