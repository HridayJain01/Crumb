import type { Allergen, Diet } from '../schemas/profile';
import type { FoodDiet } from '../nutrition/types';

const ALLOWED: Record<Diet, FoodDiet[]> = {
  any: ['vegan', 'veg', 'egg', 'nonveg'],
  eggetarian: ['vegan', 'veg', 'egg'],
  veg: ['vegan', 'veg'],
  vegan: ['vegan'],
  jain: ['vegan', 'veg'],
};

/** Whether a food fits the user's diet and allergies. Jain also excludes root vegetables etc. */
export function fitsDiet(
  food: { diet: FoodDiet; jainAvoid?: boolean; allergens?: readonly Allergen[] },
  diet: Diet,
  allergies: readonly Allergen[] = [],
): boolean {
  if (!ALLOWED[diet].includes(food.diet)) return false;
  if (diet === 'jain' && food.jainAvoid) return false;
  if (food.allergens?.some((a) => allergies.includes(a))) return false;
  return true;
}
