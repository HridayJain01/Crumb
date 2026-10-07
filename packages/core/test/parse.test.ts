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
    const r = parseMealText('2 rotis and blorptastic zzzquux', db);
    expect(r.meals[0]!.items.map((i) => i.identification)).toEqual(['high', 'low']);
  });

  it('reports not_food when nothing is recognisable, or the input is empty', () => {
    expect(parseMealText('   ', db).status).toBe('not_food');
    const r = parseMealText('my laptop charger', db);
    expect(r).toMatchObject({ status: 'not_food', meals: [] });
  });

  it('treats "less oil" as how the dish was cooked, not as an extra item', () => {
    const r = parseMealText('2 rotis + dal + salad, less oil', db);
    expect(ids(r.meals[0]!.items)).toEqual(['roti', 'dal', 'salad']);
    expect(r.meals[0]!.items.every((i) => i.oilLevel === 'light')).toBe(true);
    expect(parseMealText('aloo sabzi without oil', db).meals[0]!.items[0]!.oilLevel).toBe('none');
    expect(parseMealText('very oily chole', db).meals[0]!.items[0]!.oilLevel).toBe('heavy');
  });

  it('ignores meals that were skipped', () => {
    const r = parseMealText('I skipped lunch, just had a cold coffee', db);
    expect(ids(r.meals.flatMap((m) => m.items))).toEqual(['cold_coffee']);
  });

  it('splits several meals named inside one sentence, cue first or cue last', () => {
    const first = parseMealText(
      'for breakfast upma, for lunch dal rice and for dinner 2 rotis with paneer bhurji',
      db,
    );
    expect(first.meals.map((m) => m.mealType)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(ids(first.meals[2]!.items)).toEqual(['roti', 'paneer_bhurji']);
    const last = parseMealText('had poha in the morning and khichdi at night', db);
    expect(last.meals.map((m) => [m.mealType, ids(m.items)])).toEqual([
      ['breakfast', ['poha']],
      ['dinner', ['khichdi']],
    ]);
  });

  it('keeps side dishes as their own foods', () => {
    expect(ids(parseMealText('kadhi chawal', db).meals[0]!.items)).toEqual(['kadhi', 'white_rice']);
    expect(ids(parseMealText('lemon rice and papad', db).meals[0]!.items)).toEqual([
      'lemon_rice',
      'papad',
    ]);
    expect(ids(parseMealText('samosa with green chutney', db).meals[0]!.items)).toEqual([
      'samosa',
      'green_chutney',
    ]);
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
