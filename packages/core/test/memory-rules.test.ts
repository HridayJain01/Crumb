import { describe, expect, it } from 'vitest';
import { getFoodDb } from '../src/nutrition/foods';
import {
  buildManualItem,
  recomputeItem,
  buildItemFromAi,
  sumItems,
} from '../src/nutrition/estimate';
import {
  cloneTemplateItems,
  diffCorrections,
  findTemplateCandidate,
  memoryHints,
  quickAdds,
  updateFoodMemory,
} from '../src/memory/memory';
import {
  generateRecommendations,
  templateInsight,
  type RecommendationContext,
} from '../src/recommend/rules';
import { periodStats, loggingStreak, sufficiencyFor } from '../src/insights/weekly';
import { summarizeDay, summaryIsStale } from '../src/summary/day';
import {
  destinationPoint,
  haversineKm,
  loopWaypoints,
  mapsWalkingUrl,
  polygonKm,
} from '../src/walk/geo';
import type { DailySummary } from '../src/schemas/summary';
import type { FoodEntry } from '../src/schemas/food';
import type { MealTemplateWithId } from '../src/schemas/memory';

const db = getFoodDb();
const roti = () => buildManualItem(db.byId.get('roti')!, { quantity: 2 });
const dal = () => buildManualItem(db.byId.get('dal')!, { quantity: 1 });

function entry(
  date: string,
  items = [roti(), dal()],
  mealType: FoodEntry['mealType'] = 'lunch',
): FoodEntry {
  return {
    date,
    loggedAt: `${date}T07:30:00.000Z`,
    mealType,
    inputType: 'text',
    status: 'confirmed',
    items,
    totals: sumItems(items),
    createdAt: '',
    updatedAt: '',
  };
}

describe('food memory', () => {
  it('learns portions with an exponential moving average', () => {
    const at = new Date('2026-10-07T08:00:00Z');
    let m = updateFoodMemory(undefined, roti(), 'lunch', at, false);
    expect(m.count).toBe(1);
    expect(m.gramsPerUnit.piece).toBe(40);
    const bigger = recomputeItem(roti(), { grams: 120 }); // 2 rotis = 120 g → 60 g each, but unit becomes g
    m = updateFoodMemory(m, bigger, 'lunch', at, true);
    expect(m.gramsPerUnit.piece).toBe(40); // gram entries don't touch per-piece weight
    expect(m.corrections).toBe(1);
    const heavyRoti = { ...roti(), grams: 120 }; // 60 g per piece
    m = updateFoodMemory(m, heavyRoti, 'dinner', at, false);
    expect(m.gramsPerUnit.piece).toBe(46); // 40 × 0.7 + 60 × 0.3
    expect(m.mealTypeCounts).toEqual({ lunch: 2, dinner: 1 });
  });

  it('records what the user corrected', () => {
    const draft = [
      buildItemFromAi(
        {
          name: 'paneer sabzi',
          canonicalName: 'paneer curry',
          quantity: 1,
          unit: 'katori',
          quantityStated: false,
          estimatedGrams: null,
          preparation: null,
          oilLevel: 'unknown',
          setting: 'home',
          identification: 'medium',
          alternatives: [],
          per100g: null,
          memoryRef: null,
        },
        { db, inputType: 'text' },
      ),
      buildItemFromAi(
        {
          name: 'roti',
          canonicalName: 'roti',
          quantity: 2,
          unit: 'piece',
          quantityStated: true,
          estimatedGrams: null,
          preparation: null,
          oilLevel: 'none',
          setting: 'home',
          identification: 'high',
          alternatives: [],
          per100g: null,
          memoryRef: null,
        },
        { db, inputType: 'text' },
      ),
    ];
    const final = [recomputeItem(draft[0]!, { quantity: 2 })];
    const corrections = diffCorrections('e1', draft, final, new Date());
    expect(corrections.map((c) => c.field)).toEqual(['quantity', 'removed']);
  });

  it('offers "Your usual lunch" after the same meal three times in two weeks', () => {
    const recent = [entry('2026-10-01'), entry('2026-10-04')];
    const latest = entry('2026-10-07');
    const candidate = findTemplateCandidate(latest, recent, [], () => 13);
    expect(candidate?.label).toBe('Your usual lunch');
    expect(candidate?.typicalHour).toBe(13);
    expect(findTemplateCandidate(latest, recent.slice(1), [], () => 13)).toBeNull();
    expect(
      findTemplateCandidate(latest, recent, [{ signature: candidate!.signature }], () => 13),
    ).toBeNull();
  });

  it('template items are re-estimated as known personal portions', () => {
    const items = cloneTemplateItems({ items: [roti(), dal()] });
    expect(items.every((i) => i.basis.quantityOrigin === 'memory')).toBe(true);
    expect(items[0]!.id).not.toBe(roti().id);
  });

  it('builds hints and time-aware quick adds', () => {
    const at = new Date('2026-10-07T08:00:00Z');
    let milk = updateFoodMemory(
      undefined,
      buildManualItem(db.byId.get('milk_toned')!),
      'breakfast',
      at,
      false,
    );
    milk = updateFoodMemory(
      milk,
      buildManualItem(db.byId.get('milk_toned')!),
      'breakfast',
      at,
      false,
    );
    let r = updateFoodMemory(undefined, roti(), 'dinner', at, false);
    r = updateFoodMemory(r, roti(), 'dinner', at, false);
    r = updateFoodMemory(r, roti(), 'dinner', at, false);
    const template: MealTemplateWithId = {
      id: 't1',
      label: 'Your usual breakfast',
      signature: 'x',
      mealType: 'breakfast',
      items: [roti()],
      count: 4,
      typicalHour: 8,
      lastUsed: at.toISOString(),
      source: 'auto',
    };
    const hints = memoryHints([milk, r], [template]);
    expect(hints[0]).toMatchObject({ key: 't1', label: 'Your usual breakfast' });
    expect(hints.map((h) => h.key)).toContain('milk_toned');
    const morning = quickAdds([milk, r], [template], 8);
    expect(morning[0]!.kind).toBe('template');
    expect(morning[1]!.id).toBe('milk_toned');
    const evening = quickAdds([milk, r], [], 20);
    expect(evening[0]!.id).toBe('roti');
  });
});

describe('recommendations', () => {
  const ctx = (over: Partial<RecommendationContext> = {}): RecommendationContext => ({
    hour: 15,
    goal: 'gain_muscle',
    diet: 'veg',
    allergies: [],
    targets: { kcal: 2400, proteinG: 125 },
    today: { kcal: 1500, proteinG: 70, steps: 6200, mealsLogged: 2, strengthSessions: 1 },
    recent: { daysLogged: 5, avgSteps: 7000, daysSinceStrength: 0 },
    ...over,
  });

  it('suggests diet-appropriate protein when the gap is large in the afternoon', () => {
    const [top] = generateRecommendations(ctx());
    expect(top!.kind).toBe('protein_gap');
    expect(top!.title).toMatch(/55 g protein/);
    expect(top!.proteinIdeas!.every((i) => i.diet === 'veg' || i.diet === 'vegan')).toBe(true);
  });

  it('respects Jain restrictions and allergies', () => {
    const [top] = generateRecommendations(ctx({ diet: 'jain', allergies: ['dairy'] }));
    const ideas = top!.proteinIdeas!;
    expect(ideas.length).toBeGreaterThan(0);
    expect(
      ideas.some((i) => i.id === 'sprouts' || i.diet === 'egg' || i.allergens?.includes('dairy')),
    ).toBe(false);
  });

  it('returns at most two actions and suggests a walk on a low-step evening', () => {
    const recs = generateRecommendations(
      ctx({
        hour: 19,
        today: { kcal: 1300, proteinG: 70, steps: 2000, mealsLogged: 2, strengthSessions: 0 },
        recent: { daysLogged: 5, avgSteps: 8000, daysSinceStrength: 4 },
      }),
    );
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.kind)).toContain('protein_gap');
  });

  it('shows only a supportive note after several very-low-intake days', () => {
    const recs = generateRecommendations(
      ctx({ recent: { daysLogged: 5, lastDaysKcal: [600, 700, 650] } }),
    );
    expect(recs).toEqual([expect.objectContaining({ kind: 'low_intake_care' })]);
  });

  it('never tells a fat-loss user to skip meals', () => {
    const recs = generateRecommendations(
      ctx({
        goal: 'lose_fat',
        hour: 20,
        today: { kcal: 3000, proteinG: 130, steps: 9000, mealsLogged: 3, strengthSessions: 0 },
      }),
    );
    expect(recs[0]!.kind).toBe('gentle_walk');
    expect(recs[0]!.text).toMatch(/no need to cut meals/);
  });

  it('template insight states facts without shaming', () => {
    const c = ctx();
    const t = templateInsight(c, generateRecommendations(c)[0]);
    expect(t.insight).toMatch(/Protein is ~55 g below target/);
  });
});

describe('weekly insights', () => {
  const day = (date: string, kcal: number, proteinG: number, steps = 6000): DailySummary => ({
    date,
    intake: { kcal, proteinG, carbsG: 0, fatG: 0 },
    intakeRange: { kcal: { low: kcal * 0.8, high: kcal * 1.2 }, proteinG: { low: 0, high: 0 } },
    mealsLogged: kcal ? 3 : 0,
    proteinByMeal: kcal ? { breakfast: 10, lunch: proteinG - 30, dinner: 20 } : {},
    steps,
    stepsSource: 'manual',
    activeKcal: 0,
    exerciseMin: 0,
    strengthSessions: 0,
    expenditure: { kcal: 2400, low: 2200, high: 2600 },
    balance: { kcal: 0, low: 0, high: 0, label: 'balanced' },
    engineVersion: 1,
    updatedAt: '',
  });

  it('labels data sufficiency (PRD §33)', () => {
    expect(sufficiencyFor(2)).toBe('insufficient');
    expect(sufficiencyFor(7)).toBe('early');
    expect(sufficiencyFor(20)).toBe('emerging');
    expect(sufficiencyFor(45)).toBe('established');
  });

  it('computes averages, adherence, streak and the lowest-protein meal', () => {
    const days = [
      day('2026-10-01', 2400, 120),
      day('2026-10-02', 2350, 118),
      day('2026-10-03', 0, 0),
      day('2026-10-04', 2500, 100),
      day('2026-10-05', 2300, 125),
      day('2026-10-06', 2450, 119),
      day('2026-10-07', 2380, 121),
    ];
    const s = periodStats(
      days,
      { kcal: 2400, proteinG: 125 },
      { from: '2026-10-01', to: '2026-10-07', today: '2026-10-07' },
    );
    expect(s.daysLogged).toBe(6);
    expect(s.sufficiency).toBe('early');
    expect(s.avgKcal).toBe(2397);
    expect(s.adherencePct).toBe(83);
    expect(s.streakDays).toBe(4);
    expect(s.lowestProteinMeal).toBe('breakfast');
    expect(s.bestProteinDay).toEqual({ date: '2026-10-05', proteinG: 125 });
  });

  it('streak continues from yesterday if today is not logged yet', () => {
    const days = [
      day('2026-10-05', 2000, 100),
      day('2026-10-06', 2000, 100),
      day('2026-10-07', 0, 0),
    ];
    expect(loggingStreak(days, '2026-10-07')).toBe(2);
  });
});

describe('day summary', () => {
  it('summarises entries + activities and detects staleness regardless of key order', () => {
    const profile = { weightKg: 72, heightCm: 175, sex: 'male' as const, age: 23 };
    const s = summarizeDay({
      date: '2026-10-07',
      entries: [entry('2026-10-07')],
      activities: [],
      profile,
      now: new Date(0),
    });
    expect(s.mealsLogged).toBe(1);
    expect(s.intake.kcal).toBeCloseTo(211.2 + 165, 1);
    expect(s.proteinByMeal.lunch).toBeGreaterThan(0);
    const shuffled = JSON.parse(JSON.stringify(s, Object.keys(s).reverse())) as DailySummary;
    expect(
      summaryIsStale(
        {
          ...shuffled,
          ...s,
          intake: {
            fatG: s.intake.fatG,
            carbsG: s.intake.carbsG,
            proteinG: s.intake.proteinG,
            kcal: s.intake.kcal,
          },
        },
        s,
      ),
    ).toBe(false);
    expect(summaryIsStale({ ...s, mealsLogged: 2 }, s)).toBe(true);
    expect(summaryIsStale({ ...s, engineVersion: 0 }, s)).toBe(true);
  });
});

describe('walk geometry', () => {
  const home = { lat: 19.076, lng: 72.8777 };

  it('destinationPoint and haversine agree', () => {
    const p = destinationPoint(home, 45, 2);
    expect(haversineKm(home, p)).toBeCloseTo(2, 2);
  });

  it('loop waypoints sit on a circle through the origin sized for the target', () => {
    const wps = loopWaypoints(home, 5, 90);
    expect(wps).toHaveLength(3);
    const straight = polygonKm([home, ...wps]);
    // Inscribed square ≈ 0.9 × circumference = 0.9 × 5 / 1.25
    expect(straight).toBeGreaterThan(3.3);
    expect(straight).toBeLessThan(3.9);
  });

  it('builds a keyless Google Maps walking URL with ≤ 3 waypoints', () => {
    const url = mapsWalkingUrl(home, loopWaypoints(home, 3, 0));
    expect(url).toContain('travelmode=walking');
    expect(url.match(/%7C/g)).toHaveLength(2);
    expect(url).not.toContain('key=');
  });
});
