import type { AiFoodItem, AiMealInterpretation } from '../schemas/ai';
import type { MealType, Unit } from '../schemas/common';
import { capitalize } from '../util';
import type { FoodDb, FoodDef } from '../nutrition/types';
import { UNIT_ALIASES } from '../nutrition/units';
import { cleanLabel } from '../nutrition/normalize';

/*
 * Offline, rule-based meal parser. Used when AI is unavailable or the device is offline,
 * and as the mock "AI" in tests. It returns the same shape Gemini returns, so one
 * deterministic pipeline (buildMealDrafts) handles both.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  three: 3,
  few: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  half: 0.5,
  quarter: 0.25,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
};

const MEAL_CUES: [MealType, RegExp][] = [
  ['breakfast', /\b(breakfast|morning|nashta|brekkie)\b/],
  ['lunch', /\b(lunch|afternoon)\b/],
  ['snack', /\b(snacks?|tea ?time|mid ?morning)\b/],
  ['dinner', /\b(dinner|supper|tonight|night)\b/],
];

const TIME = /\b(at\s+)?\d{1,2}(:\d{2})?\s*(am|pm)\b|\bat\s+\d{1,2}(:\d{2})?\b/g;

const FILLER =
  /\b(i've|i have|i|had|have|having|ate|eaten|drank|for|this|in the|today|yesterday|morning|afternoon|evening|night|tonight|breakfast|lunch|dinner|supper|snacks?|then|also|just|some|my|of|lots?|bit)\b/g;

const SEPARATORS = /,|;|\band\b|&|\+|\bwith\b|\bplus\b|\balong\b|\bfollowed by\b/;
const JOINERS = / (with|and|&) /;

function detectMealType(sentence: string): MealType | null {
  for (const [type, re] of MEAL_CUES) if (re.test(sentence)) return type;
  return null;
}

function parseNumberToken(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const range = token.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  if (token === '½') return 0.5;
  if (token === '¼') return 0.25;
  return NUMBER_WORDS[token] ?? null;
}

export interface QuantityParse {
  quantity: number;
  unit: Unit | null;
  stated: boolean;
  rest: string;
}

/** Leading/trailing quantity and unit: "2 rotis", "a glass milk", "200g paneer", "rice 1 bowl". */
export function parseQuantity(phrase: string): QuantityParse {
  const text = phrase
    .trim()
    .toLowerCase()
    .replace(/(\d)\s*-\s*(\d)/g, '$1-$2')
    .replace(/(\d)([a-z½¼])/g, '$1 $2');
  const tokens = text.split(/\s+/).filter((t) => t && t !== 'x');
  let quantity = 1;
  let stated = false;
  let unit: Unit | null = null;
  let factor = 1;
  let i = 0;

  const first = tokens[0];
  const n = first !== undefined ? parseNumberToken(first) : null;
  if (n !== null && n > 0) {
    quantity = n;
    stated = true;
    i = 1;
    if (tokens[i] === 'and' && tokens[i + 1] === 'a' && tokens[i + 2] === 'half') {
      quantity += 0.5;
      i += 3;
    } else if (tokens[i] === 'a' || tokens[i] === 'an') {
      i += 1;
    }
  }
  const maybeUnit = tokens[i];
  if (maybeUnit && UNIT_ALIASES[maybeUnit]) {
    const alias = UNIT_ALIASES[maybeUnit];
    unit = alias.unit;
    factor = alias.factor ?? 1;
    // "glass of milk" states one glass even without a number.
    stated = true;
    i += 1;
  }
  let rest = tokens.slice(i).join(' ');
  if (!stated) {
    // Trailing amount: "roti 2", "rice 1 bowl", "idli x 3"
    const trailing = rest.match(/^(.*?)\s+(\d+(?:\.\d+)?)(?:\s+([a-z]+))?$/);
    const trailingUnit = trailing?.[3] ? UNIT_ALIASES[trailing[3]] : undefined;
    if (trailing && trailing[1] && (!trailing[3] || trailingUnit)) {
      rest = trailing[1];
      quantity = Number(trailing[2]);
      stated = true;
      if (trailingUnit) {
        unit = trailingUnit.unit;
        factor = trailingUnit.factor ?? 1;
      }
    }
  }
  return { quantity: quantity * factor, unit, stated, rest };
}

function unknownItem(
  text: string,
  quantity: number,
  unit: Unit | null,
  stated: boolean,
): AiFoodItem {
  const name = capitalize(cleanLabel(text, 60));
  return {
    name,
    canonicalName: name,
    quantity,
    unit: unit ?? 'serving',
    quantityStated: stated,
    estimatedGrams: null,
    preparation: null,
    oilLevel: 'unknown',
    setting: 'unknown',
    identification: 'low',
    alternatives: [],
    per100g: null,
    memoryRef: null,
  };
}

function foodItem(
  food: FoodDef,
  text: string,
  quantity: number,
  unit: Unit | null,
  stated: boolean,
): AiFoodItem {
  const name = capitalize(cleanLabel(text, 60)) || food.name;
  return {
    name,
    canonicalName: food.name,
    quantity,
    unit: unit ?? food.defaultUnit,
    quantityStated: stated,
    estimatedGrams: null,
    preparation: null,
    oilLevel: 'unknown',
    setting: 'home',
    identification: 'high',
    alternatives: [],
    per100g: null,
    memoryRef: null,
  };
}

function parsePhrase(phrase: string, db: FoodDb): AiFoodItem[] {
  const cleaned = phrase.replace(TIME, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const q = parseQuantity(cleaned);
  const rest = q.rest.trim();
  if (!rest) return [];

  const segments = db.segment(rest);
  const foods = segments.filter((s) => s.food);
  if (foods.length >= 2) {
    // "roti sabzi dal" → several foods; the stated amount belongs to the first one.
    let firstFood = true;
    return segments.map((s) => {
      if (!s.food) return unknownItem(s.text, 1, null, false);
      const item = firstFood
        ? foodItem(s.food, s.text, q.quantity, q.unit, q.stated)
        : foodItem(s.food, s.text, 1, null, false);
      firstFood = false;
      return item;
    });
  }
  const match = db.match(rest);
  if (match) {
    const item = foodItem(match.food, rest, q.quantity, q.unit, q.stated);
    if (match.method !== 'exact') item.identification = 'medium';
    return [item];
  }
  return [unknownItem(rest, q.quantity, q.unit, q.stated)];
}

/** Keeps multi-word aliases like "coffee with milk" together before splitting on "with"/"and". */
function protectJoinedAliases(sentence: string, db: FoodDb): string {
  let out = sentence;
  const joined = db.foods
    .flatMap((f) => f.aliases)
    .filter((a) => JOINERS.test(a))
    .sort((a, b) => b.length - a.length);
  for (const alias of joined) {
    if (out.includes(alias)) out = out.split(alias).join(alias.replace(/ /g, '_'));
  }
  return out;
}

/** Rule-based interpretation of a meal description; returns Gemini's output shape. */
export function parseMealText(
  text: string,
  db: FoodDb,
  opts: { defaultMealType?: MealType } = {},
): AiMealInterpretation {
  const sentences = text
    .toLowerCase()
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const meals = new Map<MealType | 'none', AiFoodItem[]>();
  let current: MealType | null = opts.defaultMealType ?? null;
  for (const sentence of sentences) {
    current = detectMealType(sentence) ?? current;
    const key = current ?? 'none';
    const phrases = protectJoinedAliases(sentence, db)
      .split(SEPARATORS)
      .map((p) => p.replace(/_/g, ' ').trim())
      .filter(Boolean);
    for (const phrase of phrases) {
      const items = parsePhrase(phrase, db);
      if (!items.length) continue;
      const list = meals.get(key) ?? [];
      list.push(...items);
      meals.set(key, list);
    }
  }

  const out = [...meals.entries()]
    .map(([mealType, items]) => ({
      mealType: mealType === 'none' ? null : mealType,
      items: items.slice(0, 20),
    }))
    .filter((m) => m.items.length);

  return {
    status: out.length ? 'ok' : 'not_food',
    imageIssue: null,
    meals: out.slice(0, 4),
    clarifyingQuestion: null,
  };
}
