import { z } from 'zod';
import {
  AiPer100gSchema,
  ImageIssueSchema,
  type AiActivity,
  type AiActivityInterpretation,
  type AiFoodItem,
  type AiInsight,
  type AiMealInterpretation,
  type AiPer100g,
} from '../schemas/ai';
import {
  ConfidenceSchema,
  MealTypeSchema,
  OilLevelSchema,
  SettingSchema,
  UnitSchema,
} from '../schemas/common';
import { IntensitySchema } from '../schemas/activity';
import { cleanLabel } from '../nutrition/normalize';
import { clamp, isFiniteNumber } from '../util';
import { containsBannedLanguage } from '../recommend/copy';

/*
 * Never trust raw model JSON (PRD §60). These functions accept `unknown`, repair what is
 * safely repairable (enums, clamps), drop what is not, and always return a valid object.
 */

const LooseNumber = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
  z.number().nullable(),
);

const LooseItemSchema = z.object({
  name: z.string(),
  canonicalName: z.string().optional().catch(undefined),
  quantity: LooseNumber.catch(null),
  unit: UnitSchema.catch('serving'),
  quantityStated: z.boolean().catch(false),
  estimatedGrams: LooseNumber.catch(null),
  preparation: z.string().nullable().catch(null),
  oilLevel: OilLevelSchema.catch('unknown'),
  setting: SettingSchema.catch('unknown'),
  identification: ConfidenceSchema.catch('medium'),
  alternatives: z.array(z.unknown()).catch([]),
  per100g: z.unknown().catch(null),
  memoryRef: z.string().nullable().catch(null),
});

const LooseMealSchema = z.object({
  mealType: MealTypeSchema.nullable().catch(null),
  items: z.array(z.unknown()).catch([]),
});

const LooseInterpretationSchema = z.object({
  status: z.enum(['ok', 'not_food', 'unclear_image']).catch('ok'),
  imageIssue: ImageIssueSchema.nullable().catch(null),
  meals: z.array(z.unknown()).catch([]),
  clarifyingQuestion: z.string().nullable().catch(null),
});

export const MAX_AI_ITEMS = 20;

/**
 * Plausibility check for model-estimated nutrition per 100 g. Rejects impossible values and
 * macros that disagree with the kcal (Atwater 4/4/9) by more than 25%.
 */
export function validatePer100g(raw: unknown): AiPer100g | null {
  const parsed = AiPer100gSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { kcal, proteinG, carbsG, fatG } = parsed.data;
  const values = [kcal, proteinG, carbsG, fatG];
  if (!values.every((v) => Number.isFinite(v) && v >= 0)) return null;
  if (kcal > 900 || proteinG > 100 || carbsG > 100 || fatG > 100) return null;
  if (proteinG + carbsG + fatG > 100.5) return null;
  const atwater = 4 * proteinG + 4 * carbsG + 9 * fatG;
  const ok = kcal >= 40 ? Math.abs(atwater - kcal) / kcal <= 0.25 : Math.abs(atwater - kcal) <= 15;
  if (!ok) return null;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { kcal: r(kcal), proteinG: r(proteinG), carbsG: r(carbsG), fatG: r(fatG) };
}

function sanitizeItem(raw: unknown): AiFoodItem | null {
  const parsed = LooseItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const name = cleanLabel(d.name, 80);
  if (!name) return null;
  const quantity =
    isFiniteNumber(d.quantity) && d.quantity > 0
      ? Math.round(clamp(d.quantity, 0.25, 50) * 100) / 100
      : 1;
  const estimatedGrams =
    isFiniteNumber(d.estimatedGrams) && d.estimatedGrams > 0
      ? Math.round(clamp(d.estimatedGrams, 1, 2000))
      : null;
  const alternatives = [
    ...new Set(
      d.alternatives
        .filter((a): a is string => typeof a === 'string')
        .map((a) => cleanLabel(a, 60))
        .filter((a) => a && a.toLowerCase() !== name.toLowerCase()),
    ),
  ].slice(0, 3);
  return {
    name,
    canonicalName: cleanLabel(d.canonicalName ?? name, 80) || name,
    quantity,
    unit: d.unit,
    quantityStated: d.quantityStated,
    estimatedGrams,
    preparation: d.preparation ? cleanLabel(d.preparation, 80) || null : null,
    oilLevel: d.oilLevel,
    setting: d.setting,
    identification: d.identification,
    alternatives,
    per100g: validatePer100g(d.per100g),
    memoryRef: d.memoryRef ? cleanLabel(d.memoryRef, 60) || null : null,
  };
}

/** Repairs and validates a meal interpretation from the model. Always returns a valid object. */
export function sanitizeMealInterpretation(raw: unknown): {
  value: AiMealInterpretation;
  dropped: number;
} {
  const top = LooseInterpretationSchema.safeParse(raw);
  if (!top.success) {
    return {
      value: { status: 'not_food', imageIssue: null, meals: [], clarifyingQuestion: null },
      dropped: 0,
    };
  }
  let dropped = 0;
  let budget = MAX_AI_ITEMS;
  const meals: AiMealInterpretation['meals'] = [];
  for (const rawMeal of top.data.meals.slice(0, 4)) {
    const meal = LooseMealSchema.safeParse(rawMeal);
    if (!meal.success) {
      dropped += 1;
      continue;
    }
    const items: AiFoodItem[] = [];
    for (const rawItem of meal.data.items) {
      if (budget <= 0) {
        dropped += 1;
        continue;
      }
      const item = sanitizeItem(rawItem);
      if (item) {
        items.push(item);
        budget -= 1;
      } else dropped += 1;
    }
    if (items.length) meals.push({ mealType: meal.data.mealType, items });
  }
  const question = top.data.clarifyingQuestion ? cleanLabel(top.data.clarifyingQuestion, 200) : '';
  return {
    value: {
      status: top.data.status,
      imageIssue: top.data.imageIssue,
      meals,
      clarifyingQuestion: question || null,
    },
    dropped,
  };
}

const LooseActivitySchema = z.object({
  type: z
    .enum([
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
    ])
    .catch('other'),
  label: z.string().catch('Workout'),
  durationMin: LooseNumber.catch(null),
  distanceKm: LooseNumber.catch(null),
  steps: LooseNumber.catch(null),
  intensity: IntensitySchema.catch('moderate'),
});

export function sanitizeActivityInterpretation(raw: unknown): AiActivityInterpretation {
  const list = z.object({ activities: z.array(z.unknown()).catch([]) }).safeParse(raw);
  if (!list.success) return { activities: [] };
  const activities: AiActivity[] = [];
  for (const item of list.data.activities.slice(0, 6)) {
    const parsed = LooseActivitySchema.safeParse(item);
    if (!parsed.success) continue;
    const a = parsed.data;
    const durationMin =
      isFiniteNumber(a.durationMin) && a.durationMin > 0 && a.durationMin <= 600
        ? Math.round(a.durationMin)
        : null;
    const distanceKm =
      isFiniteNumber(a.distanceKm) && a.distanceKm > 0 && a.distanceKm <= 200
        ? Math.round(a.distanceKm * 100) / 100
        : null;
    const steps =
      isFiniteNumber(a.steps) && a.steps > 0 && a.steps <= 100_000 ? Math.round(a.steps) : null;
    if (durationMin === null && distanceKm === null && steps === null) continue;
    activities.push({
      type: a.type,
      label: cleanLabel(a.label, 60) || 'Workout',
      durationMin,
      distanceKm,
      steps,
      intensity: a.intensity,
    });
  }
  return { activities };
}

/** Validates model wording for insights; returns null if unusable so a template is used. */
export function sanitizeInsight(raw: unknown): AiInsight | null {
  const parsed = z.object({ insight: z.string(), action: z.string() }).safeParse(raw);
  if (!parsed.success) return null;
  const insight = cleanLabel(parsed.data.insight, 240);
  const action = cleanLabel(parsed.data.action, 160);
  if (!insight || !action) return null;
  if (containsBannedLanguage(insight) || containsBannedLanguage(action)) return null;
  return { insight, action };
}
