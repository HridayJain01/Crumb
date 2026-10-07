import { describe, expect, it } from 'vitest';
import { getFoodDb } from '../src/nutrition/foods';
import {
  buildItemFromAi,
  buildManualItem,
  recomputeItem,
  recomputeItemWithDb,
  sigmaOf,
  sumItems,
} from '../src/nutrition/estimate';
import { buildMealDrafts } from '../src/nutrition/meal';
import { parseMealText } from '../src/parse/meal-text';
import type { AiFoodItem } from '../src/schemas/ai';
import type { FoodMemory } from '../src/schemas/memory';

const db = getFoodDb();

function ai(partial: Partial<AiFoodItem> & { name: string }): AiFoodItem {
  return {
    canonicalName: partial.name,
    quantity: 1,
    unit: 'serving',
    quantityStated: false,
    estimatedGrams: null,
    preparation: null,
    oilLevel: 'unknown',
    setting: 'home',
    identification: 'high',
    alternatives: [],
    per100g: null,
    memoryRef: null,
    ...partial,
  };
}

describe('buildItemFromAi', () => {
  it('"2 rotis" from text: known food + stated count → High confidence from the table', () => {
    const item = buildItemFromAi(
      ai({ name: 'roti', quantity: 2, unit: 'piece', quantityStated: true }),
      {
        db,
        inputType: 'text',
      },
    );
    expect(item.foodId).toBe('roti');
    expect(item.grams).toBe(80);
    expect(item.gramsSource).toBe('db_unit');
    expect(item.source).toBe('curated_db');
    expect(item.nutrition.kcal).toBeCloseTo(211.2, 1);
    expect(item.confidence).toBe('high');
    expect(item.range.kcal.low).toBeLessThan(item.nutrition.kcal);
    expect(item.range.kcal.high).toBeGreaterThan(item.nutrition.kcal);
    expect(item.assumptions[0]).toMatch(/1 roti ≈ 40 g/);
  });

  it('"paneer sabzi" with no amount → Medium', () => {
    const item = buildItemFromAi(
      ai({
        name: 'paneer sabzi',
        unit: 'katori',
        identification: 'medium',
        alternatives: ['Matar paneer'],
      }),
      { db, inputType: 'text' },
    );
    expect(item.foodId).toBe('paneer_sabzi');
    expect(item.confidence).toBe('medium');
    expect(item.assumptions.join(' ')).toMatch(/Amount not stated/);
    expect(item.alternatives).toEqual(['Matar paneer']);
  });

  it('photo portions use the model’s gram estimate (clamped to a sane range)', () => {
    const item = buildItemFromAi(
      ai({ name: 'chicken biryani', unit: 'plate', estimatedGrams: 420 }),
      { db, inputType: 'photo' },
    );
    expect(item.grams).toBe(420);
    expect(item.gramsSource).toBe('ai_estimate');
    expect(item.confidence).toBe('medium');

    const silly = buildItemFromAi(ai({ name: 'idli', unit: 'piece', estimatedGrams: 2000 }), {
      db,
      inputType: 'photo',
    });
    expect(silly.grams).toBe(120); // ≤ 3× the 40 g reference
  });

  it('restaurant curry from a photo with unclear identity → Low', () => {
    const item = buildItemFromAi(
      ai({
        name: 'paneer curry',
        unit: 'bowl',
        estimatedGrams: 200,
        setting: 'restaurant',
        identification: 'medium',
      }),
      { db, inputType: 'photo' },
    );
    expect(item.confidence).toBe('low');
    expect(item.assumptions.join(' ')).toMatch(/Restaurant/);
    // Restaurant fat factor raises kcal vs. the home-style table value.
    expect(item.nutrition.kcal).toBeGreaterThan((172 * 200) / 100);
  });

  it('heavy oil increases kcal for oil-sensitive dishes only', () => {
    const base = buildItemFromAi(ai({ name: 'aloo sabzi', unit: 'katori', oilLevel: 'moderate' }), {
      db,
      inputType: 'text',
    });
    const heavy = buildItemFromAi(ai({ name: 'aloo sabzi', unit: 'katori', oilLevel: 'heavy' }), {
      db,
      inputType: 'text',
    });
    expect(heavy.nutrition.kcal).toBeGreaterThan(base.nutrition.kcal);
    expect(heavy.nutrition.proteinG).toBe(base.nutrition.proteinG);
    const banana = buildItemFromAi(ai({ name: 'banana', unit: 'piece', oilLevel: 'heavy' }), {
      db,
      inputType: 'text',
    });
    expect(banana.nutrition.kcal).toBeCloseTo(105, 0);
  });

  it('unknown food with plausible AI nutrition → Low, labelled as an AI estimate', () => {
    const item = buildItemFromAi(
      ai({
        name: 'quinoa tabbouleh',
        unit: 'bowl',
        identification: 'medium',
        per100g: { kcal: 140, proteinG: 4, carbsG: 20, fatG: 5 },
      }),
      { db, inputType: 'text' },
    );
    expect(item.foodId).toBeNull();
    expect(item.source).toBe('ai_estimate');
    expect(item.confidence).toBe('low');
    expect(item.needsInput).toBe(false);
  });

  it('unknown food without nutrition asks the user instead of inventing numbers', () => {
    const item = buildItemFromAi(ai({ name: 'mystery dish', identification: 'low' }), {
      db,
      inputType: 'text',
    });
    expect(item.needsInput).toBe(true);
    expect(item.nutrition.kcal).toBe(0);
    expect(item.confidence).toBe('low');
    expect(item.assumptions.join(' ')).toMatch(/tell me what this is/i);
  });

  it('uses the user’s remembered portion once seen 3+ times', () => {
    const memory: FoodMemory = {
      key: 'roti',
      label: 'Roti (chapati)',
      foodId: 'roti',
      emoji: '🫓',
      count: 5,
      lastUsed: '2026-10-01T08:00:00.000Z',
      typicalUnit: 'piece',
      typicalQuantity: 2,
      gramsPerUnit: { piece: 52 },
      per100g: { kcal: 264, proteinG: 8.5, carbsG: 49, fatG: 4 },
      mealTypeCounts: { lunch: 5 },
      corrections: 2,
    };
    const item = buildItemFromAi(
      ai({ name: 'roti', quantity: 2, unit: 'piece', quantityStated: true }),
      {
        db,
        inputType: 'text',
        memory: new Map([['roti', memory]]),
      },
    );
    expect(item.grams).toBe(104);
    expect(item.gramsSource).toBe('memory');
    expect(item.assumptions[0]).toMatch(/usual portion/);
  });
});

describe('editing items', () => {
  const base = buildItemFromAi(
    ai({ name: 'paneer sabzi', unit: 'katori', identification: 'medium' }),
    { db, inputType: 'text' },
  );

  it('changing the count scales grams and marks the amount as stated', () => {
    const edited = recomputeItem(base, { quantity: 2 });
    expect(edited.grams).toBe(base.grams * 2);
    expect(edited.basis.quantityOrigin).toBe('stated_food_unit');
    expect(edited.sigma).toBeLessThan(base.sigma);
    expect(edited.id).toBe(base.id);
  });

  it('typing grams records a user-entered amount', () => {
    const edited = recomputeItem(base, { grams: 200 });
    expect(edited.unit).toBe('g');
    expect(edited.gramsSource).toBe('user');
    expect(edited.nutrition.kcal).toBeCloseTo(344, 0);
  });

  it('picking the right food makes identification certain', () => {
    const matar = db.byId.get('matar_paneer')!;
    const edited = recomputeItem(base, { food: matar });
    expect(edited.foodId).toBe('matar_paneer');
    expect(edited.name).toBe('Matar paneer');
    expect(edited.basis.userChoseFood).toBe(true);
    expect(edited.sigma).toBeLessThan(base.sigma);
  });

  it('switching unit uses the food’s own unit weight when known', () => {
    const roti = buildManualItem(db.byId.get('white_rice')!, { quantity: 1, unit: 'bowl' });
    const plate = recomputeItemWithDb(roti, { unit: 'plate' }, db);
    expect(plate.grams).toBe(250);
    expect(plate.gramsSource).toBe('db_unit');
  });
});

describe('totals', () => {
  it('sums items and combines uncertainty as root-sum-square', () => {
    const a = buildManualItem(db.byId.get('roti')!, { quantity: 2 });
    const b = buildManualItem(db.byId.get('dal')!, { quantity: 1 });
    const totals = sumItems([a, b]);
    expect(totals.nutrition.kcal).toBeCloseTo(a.nutrition.kcal + b.nutrition.kcal, 1);
    const linearHalfWidth =
      (a.range.kcal.high - a.range.kcal.low) / 2 + (b.range.kcal.high - b.range.kcal.low) / 2;
    expect((totals.kcal.high - totals.kcal.low) / 2).toBeLessThan(linearHalfWidth);
  });

  it('sigma formula is the documented root-sum-square', () => {
    const s = sigmaOf({
      per100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      fatFactor: 1,
      gramsPerUnit: 1,
      idConfidence: 'medium',
      userChoseFood: false,
      quantityOrigin: 'ai_text',
      nutritionOrigin: 'curated',
      prep: 'unknown',
    });
    expect(s).toBeCloseTo(Math.sqrt(0.15 ** 2 + 0.2 ** 2 + 0.1 ** 2 + 0.1 ** 2), 6);
  });
});

describe('buildMealDrafts', () => {
  it('turns the PRD example into estimated breakfast and lunch drafts', () => {
    const interp = parseMealText(
      'This morning I had a glass of milk and two bananas. For lunch I had two rotis, aloo sabzi and dal.',
      db,
    );
    const drafts = buildMealDrafts(interp, { db, inputType: 'text', hour: 14 });
    expect(drafts.map((d) => d.mealType)).toEqual(['breakfast', 'lunch']);
    const lunch = drafts[1]!;
    expect(lunch.items).toHaveLength(3);
    const totals = sumItems(lunch.items);
    expect(totals.nutrition.kcal).toBeGreaterThan(400);
    expect(totals.nutrition.kcal).toBeLessThan(600);
  });

  it('uses the clock when the text has no meal cue', () => {
    const interp = parseMealText('two idlis and sambar', db);
    expect(buildMealDrafts(interp, { db, inputType: 'text', hour: 8 })[0]!.mealType).toBe(
      'breakfast',
    );
    expect(buildMealDrafts(interp, { db, inputType: 'text', hour: 20 })[0]!.mealType).toBe(
      'dinner',
    );
  });
});
