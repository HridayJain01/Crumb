import Fuse from 'fuse.js';
import { FOODS } from './foods-data';
import { normalizeFoodName } from './normalize';
import type { FoodDb, FoodDef, FoodMatch } from './types';

/*
 * The food database is a separate entry point (`@crumb/core/foods`) so the web app can
 * lazy-load it only on logging screens. Everything else in core receives a `FoodDb`.
 */

/** Adjectives that should not become separate "unknown foods" when segmenting a phrase. */
const MODIFIERS = new Set([
  'spicy',
  'mild',
  'extra',
  'less',
  'oily',
  'dry',
  'thick',
  'thin',
  'crispy',
  'soft',
  'salted',
  'unsalted',
  'sweetened',
  'unsweetened',
  'roasted',
  'grilled',
  'steamed',
  'fried',
  'baked',
  'boiled',
  'healthy',
  'tasty',
  'leftover',
  'quick',
  'side',
  'piece',
  'pieces',
]);

const MAX_ALIAS_TOKENS = 5;

interface AliasEntry {
  alias: string;
  food: FoodDef;
}

export function createFoodDb(foods: readonly FoodDef[]): FoodDb {
  const byId = new Map<string, FoodDef>();
  const aliasIndex = new Map<string, FoodDef>();
  const entries: AliasEntry[] = [];

  for (const food of foods) {
    byId.set(food.id, food);
    const keys = new Set<string>([
      normalizeFoodName(food.name),
      normalizeFoodName(food.id.replace(/_/g, ' ')),
      ...food.aliases.map(normalizeFoodName),
    ]);
    for (const key of keys) {
      if (!key) continue;
      if (!aliasIndex.has(key)) aliasIndex.set(key, food);
      entries.push({ alias: key, food });
    }
  }

  const fuse = new Fuse(entries, {
    keys: ['alias'],
    includeScore: true,
    threshold: 0.32,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  function containsMatch(tokens: string[]): FoodMatch | null {
    let best: { food: FoodDef; len: number; end: number } | null = null;
    for (let start = 0; start < tokens.length; start++) {
      for (let len = Math.min(MAX_ALIAS_TOKENS, tokens.length - start); len >= 1; len--) {
        const key = tokens.slice(start, start + len).join(' ');
        const food = aliasIndex.get(key);
        if (!food) continue;
        const end = start + len;
        // Prefer longer aliases; among equals prefer the later one (English head noun is last).
        if (!best || len > best.len || (len === best.len && end > best.end)) {
          best = { food, len, end };
        }
        break;
      }
    }
    if (!best) return null;
    const coverage = best.len / tokens.length;
    // A multi-word alias inside the phrase is a strong signal; a lone word is weaker.
    const score = best.len >= 2 ? 0.15 : coverage >= 0.5 ? 0.25 : 0.35;
    return { food: best.food, method: 'contains', score };
  }

  function match(name: string): FoodMatch | null {
    const key = normalizeFoodName(name);
    if (!key) return null;
    const exact = aliasIndex.get(key);
    if (exact) return { food: exact, method: 'exact', score: 0 };

    const tokens = key.split(' ');
    const contained = tokens.length > 1 ? containsMatch(tokens) : null;
    if (contained && contained.score <= 0.25) return contained;

    const [hit] = fuse.search(key, { limit: 1 });
    const fuzzy: FoodMatch | null =
      hit && hit.score !== undefined && hit.score <= 0.32
        ? { food: hit.item.food, method: 'fuzzy', score: hit.score }
        : null;

    if (contained && fuzzy) return contained.score <= fuzzy.score ? contained : fuzzy;
    return fuzzy ?? contained;
  }

  function search(query: string, limit = 8): FoodDef[] {
    const key = normalizeFoodName(query);
    if (!key) return [];
    const seen = new Set<string>();
    const results: FoodDef[] = [];
    const exact = aliasIndex.get(key);
    if (exact) {
      seen.add(exact.id);
      results.push(exact);
    }
    for (const hit of fuse.search(key, { limit: limit * 4 })) {
      if (seen.has(hit.item.food.id)) continue;
      seen.add(hit.item.food.id);
      results.push(hit.item.food);
      if (results.length >= limit) break;
    }
    return results;
  }

  function segment(phrase: string): { food: FoodDef | null; text: string }[] {
    const tokens = normalizeFoodName(phrase).split(' ').filter(Boolean);
    const out: { food: FoodDef | null; text: string }[] = [];
    let pending: string[] = [];

    const flushPending = () => {
      const words = pending.filter((t) => !MODIFIERS.has(t));
      if (words.length) out.push({ food: null, text: words.join(' ') });
      pending = [];
    };

    let i = 0;
    while (i < tokens.length) {
      let matched = false;
      for (let len = Math.min(MAX_ALIAS_TOKENS, tokens.length - i); len >= 1; len--) {
        const key = tokens.slice(i, i + len).join(' ');
        const food = aliasIndex.get(key);
        if (!food) continue;
        // Unknown words right before a food are treated as its descriptor ("methi sabzi").
        const descriptor = pending.filter((t) => !MODIFIERS.has(t));
        pending = [];
        out.push({ food, text: [...descriptor, key].join(' ') });
        i += len;
        matched = true;
        break;
      }
      if (!matched) {
        pending.push(tokens[i] as string);
        i += 1;
      }
    }
    if (pending.length) {
      const last = out[out.length - 1];
      const words = pending.filter((t) => !MODIFIERS.has(t));
      // Trailing words after a food describe it ("dal fry", "chicken masala").
      if (last && last.food && words.length) last.text = `${last.text} ${words.join(' ')}`;
      else flushPending();
    }
    return out;
  }

  return { foods, byId, match, search, segment };
}

let singleton: FoodDb | null = null;

/** Shared, lazily built database of the bundled foods. */
export function getFoodDb(): FoodDb {
  singleton ??= createFoodDb(FOODS);
  return singleton;
}

export { FOODS };
export type { FoodDb, FoodDef, FoodMatch } from './types';
