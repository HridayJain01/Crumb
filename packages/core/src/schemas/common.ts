import { z } from 'zod';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MealTypeSchema = z.enum(MEAL_TYPES);
export type MealType = z.infer<typeof MealTypeSchema>;

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Household and metric units the app understands. `katori` is the Indian ~150 ml bowl. */
export const UNITS = [
  'piece',
  'bowl',
  'katori',
  'glass',
  'cup',
  'plate',
  'slice',
  'tbsp',
  'tsp',
  'scoop',
  'handful',
  'serving',
  'g',
  'ml',
] as const;
export const UnitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof UnitSchema>;

export const OIL_LEVELS = ['none', 'light', 'moderate', 'heavy', 'unknown'] as const;
export const OilLevelSchema = z.enum(OIL_LEVELS);
export type OilLevel = z.infer<typeof OilLevelSchema>;

export const SETTINGS = ['home', 'restaurant', 'packaged', 'unknown'] as const;
export const SettingSchema = z.enum(SETTINGS);
export type Setting = z.infer<typeof SettingSchema>;

export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export type DateKey = string;

export const NutrientsSchema = z.object({
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});
export type Nutrients = z.infer<typeof NutrientsSchema>;

export const RangeSchema = z.object({
  low: z.number().min(0),
  high: z.number().min(0),
});
export type Range = z.infer<typeof RangeSchema>;

export const ZERO_NUTRIENTS: Nutrients = Object.freeze({
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
});
