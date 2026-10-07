import { describe, expect, it } from 'vitest';
import { getFoodDb } from '../src/nutrition/foods';
import { parseMealText, parseQuantity } from '../src/parse/meal-text';
import { parseActivityText } from '../src/parse/activity-text';

const db = getFoodDb();
const ids = (items: { canonicalName: string }[]) =>
  items.map((i) => db.match(i.canonicalName)?.food.id ?? null);

describe('parseQuantity', () => {
  it.each([
    ['2 rotis', 2, null, 'rotis'],
    ['a glass of milk', 1, 'glass', 'of milk'],
    ['200g paneer', 200, 'g', 'paneer'],
    ['half plate biryani', 0.5, 'plate', 'biryani'],
    ['1.5 cups rice', 1.5, 'cup', 'rice'],
    ['rice 1 bowl', 1, 'bowl', 'rice'],
    ['idli x 3', 3, null, 'idli'],
    ['2-3 rotis', 2.5, null, 'rotis'],
    ['1 litre water', 1000, 'ml', 'water'],
  ])('%s', (text, quantity, unit, rest) => {
    const q = parseQuantity(text);
    expect(q.quantity).toBe(quantity);
    expect(q.unit).toBe(unit);
    expect(q.rest).toBe(rest);
    expect(q.stated).toBe(true);
  });

  it('marks implicit amounts as not stated', () => {
    expect(parseQuantity('dal').stated).toBe(false);
  });
});

describe('parseMealText (offline parser)', () => {
  it('splits the PRD example into breakfast and lunch', () => {
    const r = parseMealText(
      'This morning I had a glass of milk and two bananas. For lunch I had two rotis, aloo sabzi and dal.',
      db,
    );
    expect(r.status).toBe('ok');
    expect(r.meals.map((m) => m.mealType)).toEqual(['breakfast', 'lunch']);
    const [breakfast, lunch] = r.meals;
    expect(ids(breakfast!.items)).toEqual(['milk_toned', 'banana']);
    expect(breakfast!.items.map((i) => i.quantity)).toEqual([1, 2]);
    expect(breakfast!.items[0]!.unit).toBe('glass');
    expect(ids(lunch!.items)).toEqual(['roti', 'aloo_sabzi', 'dal']);
    expect(lunch!.items[0]!.quantity).toBe(2);
    expect(lunch!.items[0]!.quantityStated).toBe(true);
    expect(lunch!.items[2]!.quantityStated).toBe(false);
  });

  it('handles the demo sentence as one meal', () => {
    const r = parseMealText('I had milk, two bananas, three rotis, paneer sabzi and dal.', db);
    expect(r.meals).toHaveLength(1);
    expect(r.meals[0]!.mealType).toBeNull();
    expect(ids(r.meals[0]!.items)).toEqual(['milk_toned', 'banana', 'roti', 'paneer_sabzi', 'dal']);
    expect(r.meals[0]!.items.map((i) => i.quantity)).toEqual([1, 2, 3, 1, 1]);
  });

  it('splits run-on Indian meal phrases', () => {
    const r = parseMealText('roti sabzi and dal', db);
    expect(ids(r.meals[0]!.items)).toEqual(['roti', 'mixed_veg', 'dal']);
  });

  it('keeps "coffee with milk" as one drink', () => {
    const r = parseMealText('coffee with milk', db);
    expect(ids(r.meals[0]!.items)).toEqual(['coffee_milk']);
  });

  it('ignores times of day', () => {
    const r = parseMealText('had poha at 9am', db);
    expect(r.meals[0]!.items).toHaveLength(1);
    expect(r.meals[0]!.items[0]!.quantity).toBe(1);
  });

  it('returns unknown foods with low identification instead of guessing', () => {
    const r = parseMealText('two blorptastic zzzquux', db);
    expect(r.meals[0]!.items.some((i) => i.identification === 'low')).toBe(true);
  });

  it('reports not_food for empty input', () => {
    expect(parseMealText('   ', db).status).toBe('not_food');
  });
});

describe('parseActivityText', () => {
  it('reads a timed workout', () => {
    const r = parseActivityText('30-minute upper-body workout');
    expect(r.activities).toEqual([
      expect.objectContaining({
        type: 'strength',
        durationMin: 30,
        label: 'Upper-body workout',
        intensity: 'moderate',
      }),
    ]);
  });

  it('reads distance and intensity', () => {
    const [walk] = parseActivityText('walked 5 km briskly').activities;
    expect(walk).toMatchObject({ type: 'walk', distanceKm: 5, intensity: 'vigorous' });
  });

  it('reads hours and multiple activities', () => {
    const r = parseActivityText('1 hour of badminton, then 20 min easy yoga');
    expect(r.activities.map((a) => [a.type, a.durationMin, a.intensity])).toEqual([
      ['sports', 60, 'moderate'],
      ['yoga', 20, 'light'],
    ]);
  });
});
