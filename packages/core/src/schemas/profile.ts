import { z } from 'zod';

export const SexSchema = z.enum(['male', 'female', 'other']);
export type Sex = z.infer<typeof SexSchema>;

export const ActivityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'very_active']);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

export const GoalSchema = z.enum([
  'lose_fat',
  'gain_muscle',
  'maintain',
  'improve_fitness',
  'general_health',
]);
export type Goal = z.infer<typeof GoalSchema>;

/** `any` = no restriction. `veg` = lacto-vegetarian. `jain` = vegetarian without root vegetables. */
export const DietSchema = z.enum(['any', 'veg', 'eggetarian', 'vegan', 'jain']);
export type Diet = z.infer<typeof DietSchema>;

export const AllergenSchema = z.enum([
  'dairy',
  'gluten',
  'nuts',
  'peanut',
  'soy',
  'egg',
  'fish',
  'shellfish',
]);
export type Allergen = z.infer<typeof AllergenSchema>;

export const ProfileSchema = z.object({
  name: z.string().trim().max(40).optional(),
  age: z.number().int().min(18).max(110),
  sex: SexSchema,
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  activityLevel: ActivityLevelSchema,
  goal: GoalSchema,
  targetWeightKg: z.number().min(30).max(300).optional(),
  diet: DietSchema.default('any'),
  allergies: z.array(AllergenSchema).max(8).default([]),
  units: z.enum(['metric', 'imperial']).default('metric'),
  timezone: z.string().max(64).default('Asia/Kolkata'),
});
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileInput = z.input<typeof ProfileSchema>;

export const TargetsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  bmr: z.number(),
  tdee: z.number(),
  method: z.literal('v1'),
  notes: z.array(z.string()).default([]),
});
export type Targets = z.infer<typeof TargetsSchema>;
