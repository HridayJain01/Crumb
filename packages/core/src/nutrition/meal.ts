import type { AiMealInterpretation } from '../schemas/ai';
import type { MealType } from '../schemas/common';
import type { FoodItem, MealDraft } from '../schemas/food';
import type { MealTemplateWithId } from '../schemas/memory';
import { MEAL_ORDER, mealTypeForHour } from '../dates';
import { buildItemFromAi, buildItemFromMemory, type ItemContext } from './estimate';
import { cloneTemplateItems } from '../memory/memory';

export interface DraftContext extends ItemContext {
  /** Local hour, used when the text gives no meal cue. */
  hour: number;
  mealTypeHint?: MealType;
  templates?: readonly MealTemplateWithId[];
}

/**
 * The single deterministic pipeline for AI output AND the offline parser:
 * interpretation → matched, portioned, estimated items grouped by meal.
 */
export function buildMealDrafts(interp: AiMealInterpretation, ctx: DraftContext): MealDraft[] {
  const fallback = ctx.mealTypeHint ?? mealTypeForHour(ctx.hour);
  const grouped = new Map<MealType, FoodItem[]>();

  for (const meal of interp.meals) {
    const type = meal.mealType ?? fallback;
    const list = grouped.get(type) ?? [];
    for (const ai of meal.items) {
      if (ai.memoryRef) {
        const template = ctx.templates?.find((t) => t.id === ai.memoryRef);
        if (template) {
          list.push(...cloneTemplateItems(template));
          continue;
        }
        const memory = ctx.memory?.get(ai.memoryRef);
        if (memory) {
          list.push(buildItemFromMemory(memory, ctx.db));
          continue;
        }
      }
      list.push(buildItemFromAi(ai, ctx));
    }
    if (list.length) grouped.set(type, list);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => MEAL_ORDER[a] - MEAL_ORDER[b])
    .map(([mealType, items]) => ({ mealType, items: items.slice(0, 30) }));
}
