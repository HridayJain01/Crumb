import type { MealType } from '../schemas/common';
import type { FoodEntry, FoodItem } from '../schemas/food';
import type { MemoryHint } from '../schemas/api';
import type { Correction, FoodMemory, MealTemplate, MealTemplateWithId } from '../schemas/memory';
import { mealTypeForHour, MEAL_LABEL } from '../dates';
import { approxKcal } from '../format';
import { applyFatFactor, finalizeItem, memoryKeyFor } from '../nutrition/estimate';
import { formatQuantity, naturalQuantity } from '../nutrition/units';
import { makeId, round1 } from '../util';

/*
 * Personal food memory (PRD §15): learns the user's own portions and repeated meals
 * from confirmed entries and corrections. Pure functions; callers persist the results.
 */

export const EMA_ALPHA = 0.3;
export const TEMPLATE_MIN_REPEATS = 3;
export const TEMPLATE_WINDOW_DAYS = 14;

function ema(prev: number | undefined, next: number): number {
  return prev === undefined ? next : prev * (1 - EMA_ALPHA) + next * EMA_ALPHA;
}

/** Folds one confirmed item into the food's memory record. */
export function updateFoodMemory(
  prev: FoodMemory | undefined,
  item: FoodItem,
  mealType: MealType,
  at: Date,
  corrected: boolean,
): FoodMemory {
  const gramsPerUnit = { ...(prev?.gramsPerUnit ?? {}) };
  if (item.unit !== 'g' && item.unit !== 'ml' && item.quantity > 0) {
    gramsPerUnit[item.unit] = round1(ema(gramsPerUnit[item.unit], item.grams / item.quantity));
  }
  const sameUnit = prev?.typicalUnit === item.unit;
  const per100g = applyFatFactor(item.basis.per100g, item.basis.fatFactor);
  return {
    key: memoryKeyFor(item.name, item.foodId),
    label: prev?.label ?? item.name,
    foodId: item.foodId,
    emoji: item.emoji,
    count: (prev?.count ?? 0) + 1,
    lastUsed: at.toISOString(),
    typicalUnit: item.unit,
    typicalQuantity:
      round1(sameUnit ? ema(prev?.typicalQuantity, item.quantity) : item.quantity) || 1,
    gramsPerUnit,
    per100g: {
      kcal: round1(per100g.kcal),
      proteinG: round1(per100g.proteinG),
      carbsG: round1(per100g.carbsG),
      fatG: round1(per100g.fatG),
    },
    mealTypeCounts: {
      ...(prev?.mealTypeCounts ?? {}),
      [mealType]: (prev?.mealTypeCounts?.[mealType] ?? 0) + 1,
    },
    corrections: (prev?.corrections ?? 0) + (corrected ? 1 : 0),
  };
}

/** What the user changed relative to the AI draft (PRD §14). */
export function diffCorrections(
  entryId: string,
  draft: readonly FoodItem[],
  final: readonly FoodItem[],
  at: Date,
): Correction[] {
  const out: Correction[] = [];
  const createdAt = at.toISOString();
  const finalIds = new Set(final.map((i) => i.id));
  for (const item of final) {
    const ai = item.aiOriginal;
    if (!ai) continue;
    if (ai.name !== item.name) {
      out.push({
        entryId,
        itemName: ai.name,
        field: 'food',
        aiValue: ai.name,
        userValue: item.name,
        createdAt,
      });
    }
    if (ai.unit !== item.unit) {
      out.push({
        entryId,
        itemName: item.name,
        field: 'unit',
        aiValue: ai.unit,
        userValue: item.unit,
        createdAt,
      });
    } else if (ai.quantity !== item.quantity) {
      out.push({
        entryId,
        itemName: item.name,
        field: 'quantity',
        aiValue: String(ai.quantity),
        userValue: String(item.quantity),
        createdAt,
      });
    }
    if (item.gramsSource === 'user' && Math.round(ai.grams) !== Math.round(item.grams)) {
      out.push({
        entryId,
        itemName: item.name,
        field: 'grams',
        aiValue: String(Math.round(ai.grams)),
        userValue: String(Math.round(item.grams)),
        createdAt,
      });
    }
  }
  for (const item of draft) {
    if (item.aiOriginal && !finalIds.has(item.id)) {
      out.push({
        entryId,
        itemName: item.name,
        field: 'removed',
        aiValue: item.name,
        userValue: '',
        createdAt,
      });
    }
  }
  return out.slice(0, 30);
}

export function wasCorrected(item: FoodItem): boolean {
  const ai = item.aiOriginal;
  if (!ai) return false;
  return (
    ai.name !== item.name ||
    ai.unit !== item.unit ||
    ai.quantity !== item.quantity ||
    item.gramsSource === 'user'
  );
}

/** Order-independent identity of a meal: the set of foods in it. */
export function mealSignature(items: readonly FoodItem[]): string {
  return [...new Set(items.map((i) => memoryKeyFor(i.name, i.foodId)))].sort().join('|');
}

export interface TemplateCandidate {
  signature: string;
  mealType: MealType;
  label: string;
  items: FoodItem[];
  typicalHour: number;
}

/**
 * Suggests saving a meal as "Your usual breakfast" once the same set of foods has been
 * confirmed TEMPLATE_MIN_REPEATS times within TEMPLATE_WINDOW_DAYS (including this one).
 */
export function findTemplateCandidate(
  entry: Pick<FoodEntry, 'items' | 'mealType' | 'date' | 'loggedAt'>,
  recent: readonly Pick<FoodEntry, 'items' | 'mealType' | 'date' | 'status'>[],
  templates: readonly Pick<MealTemplate, 'signature'>[],
  localHourOf: (iso: string) => number,
): TemplateCandidate | null {
  if (entry.items.length < 2) return null;
  const signature = mealSignature(entry.items);
  if (templates.some((t) => t.signature === signature)) return null;
  const since = new Date(`${entry.date}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - TEMPLATE_WINDOW_DAYS);
  const sinceKey = since.toISOString().slice(0, 10);
  const repeats = recent.filter(
    (e) =>
      e.status === 'confirmed' &&
      e.mealType === entry.mealType &&
      e.date >= sinceKey &&
      mealSignature(e.items) === signature,
  ).length;
  if (repeats + 1 < TEMPLATE_MIN_REPEATS) return null;
  return {
    signature,
    mealType: entry.mealType,
    label: `Your usual ${MEAL_LABEL[entry.mealType].toLowerCase()}`,
    items: entry.items.map((i) => ({ ...i, aiOriginal: undefined })),
    typicalHour: localHourOf(entry.loggedAt),
  };
}

/** Fresh copies of a saved meal's items, marked as the user's own known portions. */
export function cloneTemplateItems(template: Pick<MealTemplate, 'items'>): FoodItem[] {
  return template.items.map((item) => {
    const oilSensitive =
      item.basis.prep === 'known' ||
      item.basis.prep === 'unknown' ||
      item.basis.prep === 'restaurant';
    return finalizeItem(
      {
        ...item,
        id: makeId('i'),
        aiOriginal: undefined,
        gramsSource: undefined,
        basis: {
          ...item.basis,
          userChoseFood: true,
          quantityOrigin: item.basis.quantityOrigin === 'user_grams' ? 'user_grams' : 'memory',
        },
      },
      { table: 'memory', oilSensitive },
    );
  });
}

/** Up to 15 labels sent to the model so "my usual shake" can be resolved (PRD §15). */
export function memoryHints(
  memories: readonly FoodMemory[],
  templates: readonly MealTemplateWithId[],
): MemoryHint[] {
  const hints: MemoryHint[] = templates
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => ({
      key: t.id,
      label: t.label,
      usual: t.items
        .map((i) => i.name)
        .join(' + ')
        .slice(0, 60),
    }));
  const foods = memories
    .filter((m) => m.count >= 2)
    .slice()
    .sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, 15 - hints.length)
    .map((m) => {
      const gpu = m.gramsPerUnit[m.typicalUnit];
      const quantity = naturalQuantity(m.typicalQuantity, m.typicalUnit);
      const grams = gpu ? ` (~${Math.round(gpu * quantity)} g)` : '';
      return {
        key: m.key,
        label: m.label,
        usual: `${formatQuantity(quantity, m.typicalUnit)}${grams}`.slice(0, 60),
      };
    });
  return [...hints, ...foods];
}

export interface QuickAdd {
  kind: 'template' | 'food';
  id: string;
  label: string;
  emoji: string;
  subtitle: string;
}

/** One-tap suggestions ordered for the current time of day. */
export function quickAdds(
  memories: readonly FoodMemory[],
  templates: readonly MealTemplateWithId[],
  hour: number,
  limit = 6,
): QuickAdd[] {
  const meal = mealTypeForHour(hour);
  const hourDistance = (h: number) => Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour));
  const t = templates
    .slice()
    .sort((a, b) => hourDistance(a.typicalHour) - hourDistance(b.typicalHour) || b.count - a.count)
    .slice(0, 3)
    .map<QuickAdd>((tpl) => ({
      kind: 'template',
      id: tpl.id,
      label: tpl.label,
      emoji: tpl.items[0]?.emoji ?? '🍽️',
      subtitle: `${tpl.items.length} items · ${approxKcal(tpl.items.reduce((s, i) => s + i.nutrition.kcal, 0))} kcal`,
    }));
  const f = memories
    .filter((m) => m.count >= 2)
    .slice()
    .sort(
      (a, b) =>
        (b.mealTypeCounts[meal] ?? 0) - (a.mealTypeCounts[meal] ?? 0) ||
        b.count - a.count ||
        b.lastUsed.localeCompare(a.lastUsed),
    )
    .slice(0, limit - t.length)
    .map<QuickAdd>((m) => ({
      kind: 'food',
      id: m.key,
      label: m.label,
      emoji: m.emoji,
      subtitle: formatQuantity(naturalQuantity(m.typicalQuantity, m.typicalUnit), m.typicalUnit),
    }));
  return [...t, ...f];
}
