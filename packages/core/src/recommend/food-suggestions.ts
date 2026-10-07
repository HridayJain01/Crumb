import type { Unit } from '../schemas/common';
import type { Allergen, Diet } from '../schemas/profile';
import type { FoodDiet } from '../nutrition/types';
import { fitsDiet } from './diet';

/**
 * Practical protein add-ons (PRD §30). Values match the bundled food table for the stated
 * portion; `foodId`/`quantity`/`unit` let the UI log one with a tap.
 */
export interface ProteinIdea {
  id: string;
  label: string;
  emoji: string;
  portion: string;
  proteinG: number;
  kcal: number;
  diet: FoodDiet;
  jainAvoid?: boolean;
  allergens?: Allergen[];
  foodId: string;
  quantity: number;
  unit: Unit;
}

export const PROTEIN_IDEAS: ProteinIdea[] = [
  {
    id: 'greek_yogurt',
    label: 'Greek yogurt / hung curd',
    emoji: '🥣',
    portion: '1 bowl (150 g)',
    proteinG: 15,
    kcal: 89,
    diet: 'veg',
    allergens: ['dairy'],
    foodId: 'greek_yogurt',
    quantity: 1,
    unit: 'serving',
  },
  {
    id: 'paneer',
    label: 'Paneer',
    emoji: '🧀',
    portion: '100 g',
    proteinG: 18,
    kcal: 291,
    diet: 'veg',
    allergens: ['dairy'],
    foodId: 'paneer',
    quantity: 1,
    unit: 'serving',
  },
  {
    id: 'paneer_bhurji',
    label: 'Paneer bhurji',
    emoji: '🧀',
    portion: '1 serving',
    proteinG: 16,
    kcal: 281,
    diet: 'veg',
    allergens: ['dairy'],
    foodId: 'paneer_bhurji',
    quantity: 1,
    unit: 'serving',
  },
  {
    id: 'protein_shake',
    label: 'Protein shake with milk',
    emoji: '🥤',
    portion: '1 glass',
    proteinG: 32,
    kcal: 266,
    diet: 'veg',
    allergens: ['dairy'],
    foodId: 'protein_shake',
    quantity: 1,
    unit: 'glass',
  },
  {
    id: 'eggs',
    label: 'Boiled eggs',
    emoji: '🥚',
    portion: '2 eggs',
    proteinG: 13,
    kcal: 155,
    diet: 'egg',
    allergens: ['egg'],
    foodId: 'boiled_egg',
    quantity: 2,
    unit: 'piece',
  },
  {
    id: 'omelette',
    label: 'Omelette',
    emoji: '🍳',
    portion: '2-egg',
    proteinG: 13,
    kcal: 185,
    diet: 'egg',
    allergens: ['egg'],
    foodId: 'omelette',
    quantity: 1,
    unit: 'piece',
  },
  {
    id: 'soya_curry',
    label: 'Soya chunk curry',
    emoji: '🍛',
    portion: '1 bowl',
    proteinG: 18,
    kcal: 200,
    diet: 'vegan',
    allergens: ['soy'],
    foodId: 'soya_curry',
    quantity: 1,
    unit: 'bowl',
  },
  {
    id: 'tofu',
    label: 'Tofu',
    emoji: '🧊',
    portion: '100 g',
    proteinG: 17,
    kcal: 144,
    diet: 'vegan',
    allergens: ['soy'],
    foodId: 'tofu',
    quantity: 1,
    unit: 'serving',
  },
  {
    id: 'chana',
    label: 'Chana chaat',
    emoji: '🫘',
    portion: '1 bowl',
    proteinG: 13,
    kcal: 246,
    diet: 'vegan',
    foodId: 'chickpeas_boiled',
    quantity: 1,
    unit: 'bowl',
  },
  {
    id: 'roasted_chana',
    label: 'Roasted chana',
    emoji: '🫘',
    portion: '2 handfuls',
    proteinG: 12,
    kcal: 217,
    diet: 'vegan',
    foodId: 'roasted_chana',
    quantity: 2,
    unit: 'handful',
  },
  {
    id: 'dal',
    label: 'An extra bowl of dal',
    emoji: '🍲',
    portion: '1 katori',
    proteinG: 8,
    kcal: 165,
    diet: 'vegan',
    foodId: 'dal',
    quantity: 1,
    unit: 'katori',
  },
  {
    id: 'sprouts',
    label: 'Sprouts salad',
    emoji: '🌱',
    portion: '1 bowl',
    proteinG: 7,
    kcal: 110,
    diet: 'vegan',
    jainAvoid: true,
    foodId: 'sprouts',
    quantity: 1,
    unit: 'bowl',
  },
  {
    id: 'milk',
    label: 'A glass of milk',
    emoji: '🥛',
    portion: '250 ml',
    proteinG: 8,
    kcal: 145,
    diet: 'veg',
    allergens: ['dairy'],
    foodId: 'milk_toned',
    quantity: 1,
    unit: 'glass',
  },
  {
    id: 'peanuts',
    label: 'Peanuts',
    emoji: '🥜',
    portion: '1 handful',
    proteinG: 7,
    kcal: 176,
    diet: 'vegan',
    allergens: ['peanut'],
    foodId: 'peanuts',
    quantity: 1,
    unit: 'handful',
  },
  {
    id: 'chicken',
    label: 'Grilled chicken',
    emoji: '🍗',
    portion: '100 g',
    proteinG: 31,
    kcal: 165,
    diet: 'nonveg',
    foodId: 'chicken_breast',
    quantity: 1,
    unit: 'serving',
  },
  {
    id: 'tandoori_chicken',
    label: 'Chicken tikka',
    emoji: '🍗',
    portion: '150 g',
    proteinG: 32,
    kcal: 225,
    diet: 'nonveg',
    allergens: ['dairy'],
    foodId: 'tandoori_chicken',
    quantity: 1,
    unit: 'serving',
  },
  {
    id: 'fish',
    label: 'Grilled fish',
    emoji: '🐟',
    portion: '120 g',
    proteinG: 31,
    kcal: 154,
    diet: 'nonveg',
    allergens: ['fish'],
    foodId: 'grilled_fish',
    quantity: 1,
    unit: 'serving',
  },
];

/** Best protein ideas for a gap, filtered by diet and allergies, preferring lean options. */
export function proteinIdeas(
  gapG: number,
  diet: Diet,
  allergies: readonly Allergen[] = [],
  limit = 4,
): ProteinIdea[] {
  return PROTEIN_IDEAS.filter((i) => fitsDiet(i, diet, allergies))
    .map((i) => ({
      idea: i,
      // Prefer ideas that cover most of the gap without overshooting, and lean protein per kcal.
      score: Math.min(i.proteinG, gapG) / Math.max(gapG, 1) + (i.proteinG / i.kcal) * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.idea);
}
