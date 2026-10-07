import { describe, expect, it } from 'vitest';
import { FOODS, getFoodDb } from '../src/nutrition/foods';
import { normalizeFoodName } from '../src/nutrition/normalize';
import { foodUnitGrams } from '../src/nutrition/estimate';
import { PROTEIN_IDEAS } from '../src/recommend/food-suggestions';

const db = getFoodDb();

describe('food table integrity', () => {
  it('has unique ids', () => {
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every row is Atwater-consistent (4P + 4C + 9F + 7A ≈ kcal)', () => {
    const bad = FOODS.filter((f) => {
      const { kcal, proteinG, carbsG, fatG, alcoholG = 0 } = f.per100g;
      const atwater = 4 * proteinG + 4 * carbsG + 9 * fatG + 7 * alcoholG;
      return kcal >= 50 ? Math.abs(atwater - kcal) / kcal > 0.2 : Math.abs(atwater - kcal) > 15;
    });
    expect(bad.map((f) => f.id)).toEqual([]);
  });

  it('has physically possible macros', () => {
    for (const f of FOODS) {
      const { proteinG, carbsG, fatG } = f.per100g;
      expect(proteinG + carbsG + fatG, f.id).toBeLessThanOrEqual(100.5);
      expect(f.per100g.kcal, f.id).toBeLessThanOrEqual(900);
    }
  });

  it('every food has a weight for its default unit', () => {
    for (const f of FOODS) expect(foodUnitGrams(f, f.defaultUnit), f.id).toBeGreaterThan(0);
  });

  it('no alias maps to two different foods', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of FOODS) {
      for (const alias of [f.name, ...f.aliases]) {
        const key = normalizeFoodName(alias);
        const prev = owner.get(key);
        if (prev && prev !== f.id) clashes.push(`${key}: ${prev} vs ${f.id}`);
        owner.set(key, f.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('protein ideas agree with the food table', () => {
    for (const idea of PROTEIN_IDEAS) {
      const food = db.byId.get(idea.foodId);
      expect(food, idea.id).toBeDefined();
      const grams = (foodUnitGrams(food!, idea.unit) ?? 0) * idea.quantity;
      const protein = (food!.per100g.proteinG * grams) / 100;
      const kcal = (food!.per100g.kcal * grams) / 100;
      expect(Math.abs(protein - idea.proteinG), idea.id).toBeLessThanOrEqual(1.5);
      expect(Math.abs(kcal - idea.kcal) / kcal, idea.id).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('food matching', () => {
  it.each([
    ['rotis', 'roti'],
    ['Chapati', 'roti'],
    ['aloo sabzi', 'aloo_sabzi'],
    ['Paneer Sabji', 'paneer_sabzi'],
    ['dal', 'dal'],
    ['toor dal', 'dal'],
    ['chicken biryani', 'chicken_biryani'],
    ['masala chai', 'chai'],
    ['idlis', 'idli'],
    ['bananas', 'banana'],
    ['sabji', 'mixed_veg'],
    ['curd', 'curd'],
    ['coffee with milk', 'coffee_milk'],
    ['whey protein', 'whey'],
  ])('%s → %s (exact)', (text, id) => {
    const m = db.match(text);
    expect(m?.food.id).toBe(id);
    expect(m?.method).toBe('exact');
  });

  it('finds a food inside a longer phrase, preferring the head noun', () => {
    expect(db.match('spicy home style aloo sabzi')?.food.id).toBe('aloo_sabzi');
    expect(db.match('glass of milk')?.food.id).toBe('milk_toned');
    expect(db.match('chicken sandwich')?.food.id).toBe('sandwich');
  });

  it('tolerates small typos', () => {
    expect(db.match('panner')?.food.id).toBe('paneer');
    expect(db.match('biriyani')?.food.id).toBe('chicken_biryani');
  });

  it('returns null for gibberish', () => {
    expect(db.match('xqzzvbnm')).toBeNull();
  });

  it('segments a run-on phrase into foods', () => {
    const segs = db.segment('roti sabzi dal');
    expect(segs.map((s) => s.food?.id)).toEqual(['roti', 'mixed_veg', 'dal']);
  });

  it('keeps unknown descriptors attached to the next food', () => {
    const segs = db.segment('methi sabzi');
    expect(segs).toHaveLength(1);
    expect(segs[0]?.food?.id).toBe('mixed_veg');
    expect(segs[0]?.text).toBe('methi sabzi');
  });

  it('search returns ranked unique foods', () => {
    const results = db.search('paneer', 5);
    expect(results[0]?.id).toBe('paneer');
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
  });
});
