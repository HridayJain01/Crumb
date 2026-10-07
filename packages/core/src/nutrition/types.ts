import type { Nutrients, Unit } from '../schemas/common';
import type { Allergen } from '../schemas/profile';

export type FoodCategory =
  | 'bread'
  | 'rice'
  | 'breakfast'
  | 'dal'
  | 'curry'
  | 'veg'
  | 'nonveg'
  | 'egg'
  | 'dairy'
  | 'fruit'
  | 'nut'
  | 'snack'
  | 'sweet'
  | 'beverage'
  | 'fat'
  | 'supplement'
  | 'fast_food'
  | 'raw_veg';

/** vegan ⊂ veg (lacto-vegetarian) ⊂ egg (eggetarian) ⊂ nonveg. */
export type FoodDiet = 'vegan' | 'veg' | 'egg' | 'nonveg';

export interface FoodDef {
  id: string;
  name: string;
  aliases: readonly string[];
  category: FoodCategory;
  emoji: string;
  /** Per 100 g as typically prepared. `alcoholG` only for drinks (7 kcal/g). */
  per100g: Nutrients & { alcoholG?: number };
  /** Grams for one of each household unit, specific to this food. */
  units: Partial<Record<Unit, number>>;
  defaultUnit: Unit;
  diet: FoodDiet;
  /** Avoided in a Jain diet (root vegetables, honey, mushrooms, sprouts). */
  jainAvoid?: boolean;
  allergens?: readonly Allergen[];
  /** Curries, sabzis and fried foods whose oil varies a lot between kitchens. */
  oilSensitive?: boolean;
  /** `usda` = USDA FoodData Central (public domain). `curated` = typical home-style recipe estimate. */
  source: 'usda' | 'curated';
  liquid?: boolean;
}

export interface FoodMatch {
  food: FoodDef;
  method: 'exact' | 'contains' | 'fuzzy';
  score: number;
}

export interface FoodDb {
  foods: readonly FoodDef[];
  byId: ReadonlyMap<string, FoodDef>;
  /** Best match for a free-text food name, or null when nothing is close enough. */
  match(name: string): FoodMatch | null;
  /** Ranked results for a search box. */
  search(query: string, limit?: number): FoodDef[];
  /** Greedy longest-alias segmentation of a phrase like "roti sabzi dal". */
  segment(phrase: string): { food: FoodDef | null; text: string }[];
}
