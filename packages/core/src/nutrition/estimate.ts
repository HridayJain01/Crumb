import type { AiFoodItem } from '../schemas/ai';
import type { Confidence, Nutrients, OilLevel, Setting, Unit } from '../schemas/common';
import type {
  FoodItem,
  GramsSource,
  InputType,
  ItemBasis,
  NutritionOrigin,
  NutritionSource,
  PrepCertainty,
  QuantityOrigin,
  Totals,
} from '../schemas/food';
import type { FoodMemory } from '../schemas/memory';
import { capitalize, clamp, makeId, round1 } from '../util';
import { cleanLabel, normalizeFoodName, slugify } from './normalize';
import type { FoodDb, FoodDef, FoodMatch } from './types';
import { formatQuantity, GENERIC_UNIT_GRAMS, naturalQuantity } from './units';

/*
 * Deterministic nutrition estimation (documented in docs/estimation.md).
 *
 * Relative uncertainty σ = √(σ_id² + σ_qty² + σ_nutrition² + σ_prep²)
 * Range = value × (1 ± σ);  σ ≤ 0.155 → High, σ ≤ 0.335 → Medium, otherwise Low.
 */

export const SIGMA = {
  id: { high: 0.05, medium: 0.15, low: 0.3, userChose: 0.03 },
  qty: {
    user_grams: 0.05,
    memory: 0.08,
    stated_food_unit: 0.1,
    stated_generic_unit: 0.15,
    ai_text: 0.2,
    ai_photo: 0.25,
  },
  nutrition: { usda: 0.05, curated: 0.1, memory: 0.15, ai: 0.3, none: 0.5 },
  prep: { 'n/a': 0, known: 0.05, unknown: 0.1, restaurant: 0.2 },
} as const satisfies {
  id: Record<Confidence | 'userChose', number>;
  qty: Record<QuantityOrigin, number>;
  nutrition: Record<NutritionOrigin, number>;
  prep: Record<PrepCertainty, number>;
};

export const CONFIDENCE_MAX_SIGMA = { high: 0.155, medium: 0.335 } as const;

/** Fat multiplier for oil-sensitive dishes, by stated oil level. */
export const OIL_FAT_FACTOR: Record<OilLevel, number> = {
  none: 0.6,
  light: 0.8,
  moderate: 1,
  heavy: 1.35,
  unknown: 1,
};
/** Restaurants typically use more fat than the home-style recipes in the table. */
export const RESTAURANT_FAT_FACTOR = 1.2;

/** Minimum memory uses before a personal portion overrides the table. */
export const MEMORY_MIN_COUNT = 3;

export function sigmaOf(basis: ItemBasis): number {
  const id = basis.userChoseFood ? SIGMA.id.userChose : SIGMA.id[basis.idConfidence];
  const q = SIGMA.qty[basis.quantityOrigin];
  const n = SIGMA.nutrition[basis.nutritionOrigin];
  const p = SIGMA.prep[basis.prep];
  return Math.sqrt(id * id + q * q + n * n + p * p);
}

export function confidenceOf(sigma: number): Confidence {
  if (sigma <= CONFIDENCE_MAX_SIGMA.high) return 'high';
  if (sigma <= CONFIDENCE_MAX_SIGMA.medium) return 'medium';
  return 'low';
}

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: round1(per100g.kcal * f),
    proteinG: round1(per100g.proteinG * f),
    carbsG: round1(per100g.carbsG * f),
    fatG: round1(per100g.fatG * f),
  };
}

/** Applies a fat multiplier and moves the kcal by the fat difference (9 kcal/g). */
export function applyFatFactor(per100g: Nutrients, factor: number): Nutrients {
  if (factor === 1) return per100g;
  const fatG = per100g.fatG * factor;
  return {
    kcal: Math.max(0, per100g.kcal + (fatG - per100g.fatG) * 9),
    proteinG: per100g.proteinG,
    carbsG: per100g.carbsG,
    fatG,
  };
}

function nutritionSourceFor(origin: NutritionOrigin): NutritionSource {
  switch (origin) {
    case 'usda':
      return 'usda_db';
    case 'curated':
      return 'curated_db';
    case 'memory':
      return 'memory';
    case 'ai':
      return 'ai_estimate';
    case 'none':
      return 'none';
  }
}

function gramsSourceFor(origin: QuantityOrigin, fromTable: GramsTable): GramsSource {
  if (origin === 'user_grams') return 'user';
  if (fromTable === 'memory') return 'memory';
  if (fromTable === 'food') return 'db_unit';
  if (fromTable === 'ai') return 'ai_estimate';
  return 'generic';
}

const ID_DOWNGRADE: Record<Confidence, Confidence> = { high: 'medium', medium: 'low', low: 'low' };

function downgrade(conf: Confidence, match: FoodMatch | null): Confidence {
  if (!match || match.method === 'exact') return conf;
  if (match.method === 'contains' && match.score <= 0.15) return conf;
  return ID_DOWNGRADE[conf];
}

/** Grams for one unit of a food, or undefined when the food has no specific weight. */
export function foodUnitGrams(food: FoodDef, unit: Unit): number | undefined {
  if (unit === 'g' || unit === 'ml') return 1;
  const specific = food.units[unit];
  if (specific) return specific;
  if (unit === 'serving') return food.units[food.defaultUnit];
  if (unit === 'katori' && food.units.bowl) return food.units.bowl;
  if (unit === 'bowl' && food.units.katori) return food.units.katori;
  return undefined;
}

export function memoryKeyFor(name: string, foodId: string | null): string {
  return foodId ?? `custom-${slugify(name)}`;
}

/** Which table a gram weight came from; drives the `gramsSource` provenance label. */
type GramsTable = 'food' | 'generic' | 'ai' | 'memory';

interface Resolved {
  grams: number;
  gramsPerUnit: number;
  origin: QuantityOrigin;
  table: GramsTable;
}

export interface GramsInput {
  food: FoodDef | null;
  memory?: FoodMemory;
  unit: Unit;
  quantity: number;
  quantityStated: boolean;
  aiGrams: number | null;
  photo: boolean;
}

/**
 * Grams resolution order (first that applies wins):
 *  explicit g/ml → photo AI estimate → personal memory → food unit table → AI text estimate → generic unit.
 */
export function resolveGrams(input: GramsInput): Resolved {
  const { food, memory, unit, quantity, quantityStated, aiGrams, photo } = input;
  const estimated: QuantityOrigin = photo ? 'ai_photo' : 'ai_text';

  if (unit === 'g' || unit === 'ml') {
    return {
      grams: quantity,
      gramsPerUnit: 1,
      origin: quantityStated ? 'user_grams' : estimated,
      table: quantityStated ? 'food' : 'ai',
    };
  }

  const tableGpu = food ? foodUnitGrams(food, unit) : undefined;
  const memoryGpu =
    memory && memory.count >= MEMORY_MIN_COUNT ? memory.gramsPerUnit[unit] : undefined;

  if (photo && aiGrams && aiGrams > 0) {
    const reference = (memoryGpu ?? tableGpu ?? GENERIC_UNIT_GRAMS[unit]) * quantity;
    const grams = clamp(aiGrams, reference / 3, reference * 3);
    return { grams, gramsPerUnit: grams / quantity, origin: 'ai_photo', table: 'ai' };
  }
  if (memoryGpu) {
    return {
      grams: memoryGpu * quantity,
      gramsPerUnit: memoryGpu,
      origin: quantityStated ? 'memory' : estimated,
      table: 'memory',
    };
  }
  if (tableGpu) {
    return {
      grams: tableGpu * quantity,
      gramsPerUnit: tableGpu,
      origin: quantityStated ? 'stated_food_unit' : estimated,
      table: 'food',
    };
  }
  if (aiGrams && aiGrams > 0) {
    return {
      grams: aiGrams,
      gramsPerUnit: aiGrams / quantity,
      origin: quantityStated ? 'stated_generic_unit' : estimated,
      table: 'ai',
    };
  }
  const generic = GENERIC_UNIT_GRAMS[unit];
  return {
    grams: generic * quantity,
    gramsPerUnit: generic,
    origin: quantityStated ? 'stated_generic_unit' : estimated,
    table: 'generic',
  };
}

function prepCertainty(oilSensitive: boolean, oil: OilLevel, setting: Setting): PrepCertainty {
  if (setting === 'restaurant' && (oilSensitive || oil === 'unknown')) return 'restaurant';
  if (!oilSensitive) return 'n/a';
  return oil === 'unknown' ? 'unknown' : 'known';
}

function fatFactorFor(oilSensitive: boolean, oil: OilLevel, setting: Setting): number {
  if (!oilSensitive) return 1;
  if (oil === 'unknown' && setting === 'restaurant') return RESTAURANT_FAT_FACTOR;
  return OIL_FAT_FACTOR[oil];
}

const OIL_NOTE: Record<OilLevel, string> = {
  none: 'No oil assumed',
  light: 'Light oil assumed',
  moderate: 'Moderate oil assumed',
  heavy: 'Generous oil/ghee assumed',
  unknown: 'Home-style oil assumed',
};

interface AssumptionInput {
  name: string;
  unit: Unit;
  quantity: number;
  grams: number;
  gramsPerUnit: number;
  basis: ItemBasis;
  quantityStated: boolean;
  oilLevel?: OilLevel;
  oilSensitive: boolean;
}

export function describeAssumptions(a: AssumptionInput): string[] {
  const notes: string[] = [];
  const gpu = Math.round(a.gramsPerUnit);
  const unitText =
    a.unit === 'piece'
      ? `1 ${a.name.replace(/\s*\(.*\)$/, '').toLowerCase()}`
      : formatQuantity(1, a.unit);
  switch (a.basis.quantityOrigin) {
    case 'user_grams':
      notes.push(`You entered ${Math.round(a.grams)} ${a.unit === 'ml' ? 'ml' : 'g'}`);
      break;
    case 'memory':
      notes.push(`Your usual portion: ${unitText} ≈ ${gpu} g`);
      break;
    case 'stated_food_unit':
      notes.push(`${capitalize(unitText)} ≈ ${gpu} g`);
      break;
    case 'stated_generic_unit':
      notes.push(`Typical ${a.unit} ≈ ${gpu} g`);
      break;
    case 'ai_photo':
      notes.push(`Portion estimated from the photo (~${Math.round(a.grams)} g)`);
      break;
    case 'ai_text':
      notes.push(
        a.quantityStated
          ? `Portion size estimated (~${Math.round(a.grams)} g)`
          : `Amount not stated — assumed ${formatQuantity(a.quantity, a.unit)} (~${Math.round(a.grams)} g)`,
      );
      break;
  }
  switch (a.basis.nutritionOrigin) {
    case 'usda':
      notes.push('Nutrition from USDA FoodData Central');
      break;
    case 'curated':
      notes.push('Typical home-style recipe values');
      break;
    case 'memory':
      notes.push('Based on your earlier confirmed entries');
      break;
    case 'ai':
      notes.push('AI-estimated nutrition (no database match)');
      break;
    case 'none':
      notes.push('Unknown food — tell me what this is');
      break;
  }
  if (a.basis.prep === 'restaurant') notes.push('Restaurant-style: oil can vary a lot');
  else if (a.oilSensitive) notes.push(OIL_NOTE[a.oilLevel ?? 'unknown']);
  return notes.slice(0, 6);
}

/** Recomputes nutrition, σ, confidence, ranges and provenance from an item's basis. */
export function finalizeItem(
  item: Omit<
    FoodItem,
    'nutrition' | 'range' | 'sigma' | 'confidence' | 'source' | 'gramsSource' | 'assumptions'
  > & {
    gramsSource?: GramsSource;
  },
  opts: { table: GramsTable; oilSensitive: boolean },
): FoodItem {
  const per100g = applyFatFactor(item.basis.per100g, item.basis.fatFactor);
  const nutrition = scaleNutrients(per100g, item.grams);
  const sigma = round1(sigmaOf(item.basis) * 1000) / 1000;
  const confidence = item.needsInput ? 'low' : confidenceOf(sigma);
  const band = (v: number) => ({
    low: round1(Math.max(0, v * (1 - sigma))),
    high: round1(v * (1 + sigma)),
  });
  return {
    ...item,
    gramsSource: item.gramsSource ?? gramsSourceFor(item.basis.quantityOrigin, opts.table),
    nutrition,
    range: { kcal: band(nutrition.kcal), proteinG: band(nutrition.proteinG) },
    sigma,
    confidence,
    source: nutritionSourceFor(item.basis.nutritionOrigin),
    assumptions: describeAssumptions({
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      grams: item.grams,
      gramsPerUnit: item.basis.gramsPerUnit,
      basis: item.basis,
      quantityStated:
        item.basis.quantityOrigin !== 'ai_text' && item.basis.quantityOrigin !== 'ai_photo',
      oilLevel: item.oilLevel,
      oilSensitive: opts.oilSensitive,
    }),
  };
}

export interface ItemContext {
  db: FoodDb;
  inputType: InputType;
  memory?: ReadonlyMap<string, FoodMemory>;
}

function findMemory(
  memory: ReadonlyMap<string, FoodMemory> | undefined,
  name: string,
  foodId: string | null,
): FoodMemory | undefined {
  if (!memory) return undefined;
  if (foodId && memory.has(foodId)) return memory.get(foodId);
  const key = normalizeFoodName(name);
  for (const m of memory.values()) {
    if (normalizeFoodName(m.label) === key) return m;
  }
  return undefined;
}

function bestMatch(db: FoodDb, ai: AiFoodItem): FoodMatch | null {
  const a = db.match(ai.name);
  if (a?.method === 'exact') return a;
  const b = ai.canonicalName ? db.match(ai.canonicalName) : null;
  if (b?.method === 'exact') return b;
  if (a && b) return a.score <= b.score ? a : b;
  return a ?? b;
}

/** Turns one validated AI (or offline-parser) item into a fully estimated FoodItem. */
export function buildItemFromAi(ai: AiFoodItem, ctx: ItemContext): FoodItem {
  const photo = ctx.inputType === 'photo';
  const byLabel = findMemory(ctx.memory, ai.name, null);
  const labelFood = byLabel?.foodId ? ctx.db.byId.get(byLabel.foodId) : undefined;
  const match: FoodMatch | null = labelFood
    ? { food: labelFood, method: 'exact', score: 0 }
    : bestMatch(ctx.db, ai);
  const food = match?.food ?? null;
  const memory = findMemory(ctx.memory, ai.name, food?.id ?? null) ?? byLabel;

  let per100g: Nutrients | null = null;
  let nutritionOrigin: NutritionOrigin = 'none';
  if (food) {
    per100g = food.per100g;
    nutritionOrigin = food.source;
  } else if (memory) {
    per100g = memory.per100g;
    nutritionOrigin = 'memory';
  } else if (ai.per100g) {
    per100g = ai.per100g;
    nutritionOrigin = 'ai';
  }

  const quantity = ai.quantity > 0 ? ai.quantity : 1;
  const resolved = resolveGrams({
    food,
    memory,
    unit: ai.unit,
    quantity,
    quantityStated: ai.quantityStated,
    aiGrams: ai.estimatedGrams,
    photo,
  });

  const oilSensitive = Boolean(food?.oilSensitive);
  const idConfidence = food ? downgrade(ai.identification, match) : ai.identification;
  const basis: ItemBasis = {
    per100g: per100g ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    fatFactor: fatFactorFor(oilSensitive, ai.oilLevel, ai.setting),
    gramsPerUnit: Math.max(0.1, round1(resolved.gramsPerUnit)),
    idConfidence,
    userChoseFood: false,
    quantityOrigin: resolved.origin,
    nutritionOrigin,
    prep: prepCertainty(oilSensitive, ai.oilLevel, ai.setting),
  };

  const name = capitalize(cleanLabel(ai.name) || food?.name || 'Food');
  return finalizeItem(
    {
      id: makeId('i'),
      name,
      foodId: food?.id ?? null,
      emoji: food?.emoji ?? '🍽️',
      quantity: round1(quantity * 100) / 100,
      unit: ai.unit,
      grams: round1(resolved.grams),
      basis,
      needsInput: per100g === null,
      oilLevel: ai.oilLevel,
      setting: ai.setting,
      alternatives: ai.alternatives.length ? ai.alternatives : undefined,
      aiOriginal: { name, quantity, unit: ai.unit, grams: round1(resolved.grams) },
    },
    { table: resolved.table, oilSensitive },
  );
}

/** An item the user picked directly from search or a quick-add chip. */
export function buildManualItem(
  food: FoodDef,
  opts: { quantity?: number; unit?: Unit; memory?: FoodMemory } = {},
): FoodItem {
  const unit = opts.unit ?? opts.memory?.typicalUnit ?? food.defaultUnit;
  // The usual amount only makes sense in the unit it was remembered in.
  const quantity =
    opts.quantity ??
    (opts.memory && opts.memory.typicalUnit === unit
      ? naturalQuantity(opts.memory.typicalQuantity, unit)
      : 1);
  const resolved = resolveGrams({
    food,
    memory: opts.memory,
    unit,
    quantity,
    quantityStated: true,
    aiGrams: null,
    photo: false,
  });
  const oilSensitive = Boolean(food.oilSensitive);
  return finalizeItem(
    {
      id: makeId('i'),
      name: food.name,
      foodId: food.id,
      emoji: food.emoji,
      quantity,
      unit,
      grams: round1(resolved.grams),
      basis: {
        per100g: food.per100g,
        fatFactor: 1,
        gramsPerUnit: Math.max(0.1, round1(resolved.gramsPerUnit)),
        idConfidence: 'high',
        userChoseFood: true,
        quantityOrigin: resolved.origin,
        nutritionOrigin: food.source,
        prep: oilSensitive ? 'unknown' : 'n/a',
      },
      needsInput: false,
      oilLevel: oilSensitive ? 'unknown' : undefined,
    },
    { table: resolved.table, oilSensitive },
  );
}

/** Re-adds a food from personal memory (works for foods outside the database too). */
export function buildItemFromMemory(memory: FoodMemory, db?: FoodDb): FoodItem {
  const food = memory.foodId ? db?.byId.get(memory.foodId) : undefined;
  if (food) return buildManualItem(food, { memory });
  const gpu = memory.gramsPerUnit[memory.typicalUnit] ?? GENERIC_UNIT_GRAMS[memory.typicalUnit];
  const quantity = naturalQuantity(memory.typicalQuantity, memory.typicalUnit);
  const grams = gpu * quantity;
  return finalizeItem(
    {
      id: makeId('i'),
      name: memory.label,
      foodId: null,
      emoji: memory.emoji,
      quantity,
      unit: memory.typicalUnit,
      grams: round1(grams),
      basis: {
        per100g: memory.per100g,
        fatFactor: 1,
        gramsPerUnit: gpu,
        idConfidence: 'high',
        userChoseFood: true,
        quantityOrigin: 'memory',
        nutritionOrigin: 'memory',
        prep: 'n/a',
      },
      needsInput: false,
    },
    { table: 'memory', oilSensitive: false },
  );
}

export interface ItemPatch {
  quantity?: number;
  unit?: Unit;
  grams?: number;
  food?: FoodDef;
}

/**
 * Applies a user edit and recomputes everything deterministically.
 * Editing the amount marks it as user-stated; picking a food marks identification as certain.
 */
export function recomputeItem(item: FoodItem, patch: ItemPatch): FoodItem {
  const food = patch.food;
  let { unit, quantity, grams } = item;
  let basis: ItemBasis = { ...item.basis };
  let table: GramsTable =
    item.gramsSource === 'db_unit' ? 'food' : item.gramsSource === 'memory' ? 'memory' : 'ai';
  let oilSensitive =
    item.basis.prep === 'known' ||
    item.basis.prep === 'unknown' ||
    item.basis.prep === 'restaurant';
  let name = item.name;
  let foodId = item.foodId;
  let emoji = item.emoji;
  let needsInput = item.needsInput;

  if (food) {
    name = food.name;
    foodId = food.id;
    emoji = food.emoji;
    needsInput = false;
    oilSensitive = Boolean(food.oilSensitive);
    if (!foodUnitGrams(food, unit)) {
      unit = food.defaultUnit;
      quantity = 1;
    }
    const gpu = foodUnitGrams(food, unit) ?? GENERIC_UNIT_GRAMS[unit];
    basis = {
      ...basis,
      per100g: food.per100g,
      nutritionOrigin: food.source,
      idConfidence: 'high',
      userChoseFood: true,
      gramsPerUnit: gpu,
      fatFactor: oilSensitive ? basis.fatFactor : 1,
      prep: oilSensitive ? (basis.prep === 'n/a' ? 'unknown' : basis.prep) : 'n/a',
      quantityOrigin:
        basis.quantityOrigin === 'user_grams'
          ? 'user_grams'
          : basis.quantityOrigin === 'ai_text' || basis.quantityOrigin === 'ai_photo'
            ? basis.quantityOrigin
            : 'stated_food_unit',
    };
    if (basis.quantityOrigin !== 'user_grams') {
      grams = gpu * quantity;
      table = 'food';
    }
  }

  if (patch.grams !== undefined) {
    grams = clamp(patch.grams, 1, 5000);
    unit = item.unit === 'ml' ? 'ml' : 'g';
    quantity = grams;
    basis = { ...basis, gramsPerUnit: 1, quantityOrigin: 'user_grams' };
    table = 'food';
  } else if (patch.unit !== undefined || patch.quantity !== undefined) {
    const nextUnit = patch.unit ?? unit;
    const nextQuantity = clamp(patch.quantity ?? quantity, 0.25, 100);
    let gpu = basis.gramsPerUnit;
    let fromTable: GramsTable = table;
    if (nextUnit !== unit) {
      if (nextUnit === 'g' || nextUnit === 'ml') {
        gpu = 1;
        fromTable = 'food';
      } else {
        gpu = GENERIC_UNIT_GRAMS[nextUnit];
        fromTable = 'generic';
      }
    }
    const origin: QuantityOrigin =
      nextUnit === 'g' || nextUnit === 'ml'
        ? 'user_grams'
        : basis.quantityOrigin === 'user_grams'
          ? 'stated_generic_unit'
          : fromTable === 'food'
            ? 'stated_food_unit'
            : fromTable === 'memory'
              ? 'memory'
              : 'stated_generic_unit';
    unit = nextUnit;
    quantity = nextQuantity;
    grams = gpu * nextQuantity;
    basis = { ...basis, gramsPerUnit: gpu, quantityOrigin: origin };
    table = fromTable;
  }

  return finalizeItem(
    {
      ...item,
      name,
      foodId,
      emoji,
      unit,
      quantity: round1(quantity * 100) / 100,
      grams: round1(grams),
      basis,
      needsInput,
      gramsSource: undefined,
    },
    { table, oilSensitive },
  );
}

/** Version of recomputeItem that can look up per-food unit weights when the unit changes. */
export function recomputeItemWithDb(item: FoodItem, patch: ItemPatch, db: FoodDb): FoodItem {
  if (patch.unit !== undefined && patch.unit !== item.unit && item.foodId && !patch.food) {
    const food = db.byId.get(item.foodId);
    const gpu = food ? foodUnitGrams(food, patch.unit) : undefined;
    if (food && gpu && patch.unit !== 'g' && patch.unit !== 'ml') {
      const quantity = clamp(patch.quantity ?? item.quantity, 0.25, 100);
      return finalizeItem(
        {
          ...item,
          unit: patch.unit,
          quantity,
          grams: round1(gpu * quantity),
          basis: { ...item.basis, gramsPerUnit: gpu, quantityOrigin: 'stated_food_unit' },
          gramsSource: undefined,
        },
        { table: 'food', oilSensitive: Boolean(food.oilSensitive) },
      );
    }
  }
  return recomputeItem(item, patch);
}

/** Sums items; the kcal/protein ranges combine item uncertainties as root-sum-square. */
export function sumItems(items: readonly FoodItem[]): Totals {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let kcalVar = 0;
  let proteinVar = 0;
  for (const item of items) {
    kcal += item.nutrition.kcal;
    proteinG += item.nutrition.proteinG;
    carbsG += item.nutrition.carbsG;
    fatG += item.nutrition.fatG;
    kcalVar += (item.sigma * item.nutrition.kcal) ** 2;
    proteinVar += (item.sigma * item.nutrition.proteinG) ** 2;
  }
  const kSd = Math.sqrt(kcalVar);
  const pSd = Math.sqrt(proteinVar);
  return {
    nutrition: {
      kcal: round1(kcal),
      proteinG: round1(proteinG),
      carbsG: round1(carbsG),
      fatG: round1(fatG),
    },
    kcal: { low: round1(Math.max(0, kcal - kSd)), high: round1(kcal + kSd) },
    proteinG: { low: round1(Math.max(0, proteinG - pSd)), high: round1(proteinG + pSd) },
  };
}
