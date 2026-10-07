import type { Unit } from '../schemas/common';

/**
 * Fallback grams per unit when a food has no specific weight for that unit.
 * Indian household measures: katori ≈ 150 ml, glass ≈ 250 ml, cup ≈ 200 ml.
 */
export const GENERIC_UNIT_GRAMS: Record<Unit, number> = {
  piece: 50,
  bowl: 150,
  katori: 150,
  glass: 250,
  cup: 200,
  plate: 250,
  slice: 30,
  tbsp: 15,
  tsp: 5,
  scoop: 30,
  handful: 30,
  serving: 150,
  g: 1,
  ml: 1,
};

/** Spoken/typed unit words → canonical unit, with an optional multiplier (litre → 1000 ml). */
export const UNIT_ALIASES: Record<string, { unit: Unit; factor?: number }> = {
  piece: { unit: 'piece' },
  pieces: { unit: 'piece' },
  pc: { unit: 'piece' },
  pcs: { unit: 'piece' },
  nos: { unit: 'piece' },
  no: { unit: 'piece' },
  bowl: { unit: 'bowl' },
  bowls: { unit: 'bowl' },
  katori: { unit: 'katori' },
  katoris: { unit: 'katori' },
  vati: { unit: 'katori' },
  glass: { unit: 'glass' },
  glasses: { unit: 'glass' },
  cup: { unit: 'cup' },
  cups: { unit: 'cup' },
  mug: { unit: 'cup' },
  mugs: { unit: 'cup' },
  plate: { unit: 'plate' },
  plates: { unit: 'plate' },
  slice: { unit: 'slice' },
  slices: { unit: 'slice' },
  tbsp: { unit: 'tbsp' },
  tablespoon: { unit: 'tbsp' },
  tablespoons: { unit: 'tbsp' },
  spoon: { unit: 'tbsp' },
  spoons: { unit: 'tbsp' },
  tsp: { unit: 'tsp' },
  teaspoon: { unit: 'tsp' },
  teaspoons: { unit: 'tsp' },
  scoop: { unit: 'scoop' },
  scoops: { unit: 'scoop' },
  handful: { unit: 'handful' },
  handfuls: { unit: 'handful' },
  serving: { unit: 'serving' },
  servings: { unit: 'serving' },
  portion: { unit: 'serving' },
  portions: { unit: 'serving' },
  g: { unit: 'g' },
  gm: { unit: 'g' },
  gms: { unit: 'g' },
  gram: { unit: 'g' },
  grams: { unit: 'g' },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml' },
  millilitre: { unit: 'ml' },
  milliliter: { unit: 'ml' },
  l: { unit: 'ml', factor: 1000 },
  litre: { unit: 'ml', factor: 1000 },
  liter: { unit: 'ml', factor: 1000 },
  litres: { unit: 'ml', factor: 1000 },
  liters: { unit: 'ml', factor: 1000 },
};

const UNIT_LABELS: Record<Unit, [string, string]> = {
  piece: ['piece', 'pieces'],
  bowl: ['bowl', 'bowls'],
  katori: ['katori', 'katoris'],
  glass: ['glass', 'glasses'],
  cup: ['cup', 'cups'],
  plate: ['plate', 'plates'],
  slice: ['slice', 'slices'],
  tbsp: ['tbsp', 'tbsp'],
  tsp: ['tsp', 'tsp'],
  scoop: ['scoop', 'scoops'],
  handful: ['handful', 'handfuls'],
  serving: ['serving', 'servings'],
  g: ['g', 'g'],
  ml: ['ml', 'ml'],
};

export function unitLabel(unit: Unit, quantity: number): string {
  const [one, many] = UNIT_LABELS[unit];
  return quantity === 1 ? one : many;
}

/** "2 rotis", "1 bowl", "150 g" — compact quantity text for cards. */
export function formatQuantity(quantity: number, unit: Unit): string {
  const q = Number.isInteger(quantity)
    ? String(quantity)
    : String(Math.round(quantity * 100) / 100);
  if (unit === 'g' || unit === 'ml') return `${q} ${unit}`;
  return `${q} ${unitLabel(unit, quantity)}`;
}
