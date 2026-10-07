import { parseActivityText, parseMealText } from '@crumb/core';
import { getFoodDb } from '@crumb/core/foods';
import type { AiClient } from './types';

/*
 * Deterministic stand-in for Gemini (MOCK_EXTERNALS=1, tests, demos without credits).
 * Text goes through the same rule-based parser the app uses offline; photos return a
 * fixed, clearly-plausible Indian lunch plate with photo-style portion estimates.
 */

const MOCK_PLATE = {
  status: 'ok',
  imageIssue: null,
  clarifyingQuestion: null,
  meals: [
    {
      mealType: null,
      items: [
        {
          name: 'Roti',
          canonicalName: 'whole wheat flatbread',
          quantity: 2,
          unit: 'piece',
          quantityStated: false,
          estimatedGrams: 85,
          preparation: 'tawa',
          oilLevel: 'light',
          setting: 'home',
          identification: 'high',
          alternatives: [],
          per100g: { kcal: 264, proteinG: 8.5, carbsG: 49, fatG: 4 },
          memoryRef: null,
        },
        {
          name: 'Dal',
          canonicalName: 'lentil curry',
          quantity: 1,
          unit: 'katori',
          quantityStated: false,
          estimatedGrams: 160,
          preparation: 'tadka',
          oilLevel: 'unknown',
          setting: 'home',
          identification: 'high',
          alternatives: ['Toor dal', 'Moong dal'],
          per100g: { kcal: 110, proteinG: 5.5, carbsG: 14, fatG: 3.5 },
          memoryRef: null,
        },
        {
          name: 'Paneer sabzi',
          canonicalName: 'paneer curry',
          quantity: 1,
          unit: 'katori',
          quantityStated: false,
          estimatedGrams: 170,
          preparation: null,
          oilLevel: 'unknown',
          setting: 'home',
          identification: 'medium',
          alternatives: ['Matar paneer', 'Kadai paneer', 'Paneer butter masala'],
          per100g: { kcal: 172, proteinG: 8, carbsG: 8, fatG: 12 },
          memoryRef: null,
        },
        {
          name: 'Rice',
          canonicalName: 'steamed white rice',
          quantity: 1,
          unit: 'bowl',
          quantityStated: false,
          estimatedGrams: 140,
          preparation: 'steamed',
          oilLevel: 'none',
          setting: 'home',
          identification: 'high',
          alternatives: [],
          per100g: { kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3 },
          memoryRef: null,
        },
      ],
    },
  ],
};

export function createMockAiClient(opts: { delayMs?: number } = {}): AiClient {
  const db = getFoodDb();
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  return {
    provider: 'mock',
    async interpretMeal(req) {
      const started = Date.now();
      await wait();
      if (req.image && !req.text) {
        return {
          value: structuredClone(MOCK_PLATE),
          model: 'mock-vision',
          latencyMs: Date.now() - started,
        };
      }
      const value = parseMealText(req.text ?? '', db, { defaultMealType: req.mealTypeHint });
      // Resolve "my usual …" against the user's saved items, like the real prompt asks Gemini to.
      const usual = /\b(usual|regular|same as always)\b/i.test(req.text ?? '');
      if (usual && req.memoryHints[0] && value.meals[0]?.items[0]) {
        value.meals[0].items[0].memoryRef = req.memoryHints[0].key;
      }
      return { value, model: 'mock-text', latencyMs: Date.now() - started };
    },
    async interpretActivity(text) {
      await wait();
      return { value: parseActivityText(text), model: 'mock-text', latencyMs: 0 };
    },
    async wordInsight(_kind, context) {
      await wait();
      const t = context.today;
      const gap = Math.round(t.proteinTarget - t.proteinG);
      const insight =
        t.mealsLogged === 0
          ? 'Nothing logged yet today — a quick photo is enough to get started.'
          : `You're at ~${Math.round(t.kcal)} of ~${Math.round(t.kcalTarget)} kcal today${gap > 5 ? `, with protein ~${gap} g below target` : ' and protein is on track'}.`;
      return {
        value: { insight, action: context.chosenAction.text },
        model: 'mock-text',
        latencyMs: 0,
      };
    },
  };
}
