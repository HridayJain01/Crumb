import { describe, expect, it } from 'vitest';
import { bmrMifflin, computeTargets, referenceWeightKg } from '../src/targets/targets';
import {
  dayExpenditure,
  energyBalance,
  estimateActivity,
  stepsNetKcal,
  walkPlan,
} from '../src/energy/energy';
import type { Activity } from '../src/schemas/activity';

const hriday = { age: 23, sex: 'male' as const, heightCm: 175, weightKg: 72 };

describe('targets', () => {
  it('uses Mifflin–St Jeor for BMR', () => {
    expect(bmrMifflin(hriday)).toBeCloseTo(1703.75, 2);
    expect(bmrMifflin({ ...hriday, sex: 'female' })).toBeCloseTo(1537.75, 2);
  });

  it('muscle gain: TDEE + ≤350 kcal surplus, 1.8 g/kg protein, rounded for display', () => {
    const t = computeTargets({ ...hriday, activityLevel: 'moderate', goal: 'gain_muscle' });
    expect(t.tdee).toBe(2641);
    expect(t.kcal).toBe(2900);
    expect(t.proteinG).toBe(130);
    expect(t.kcal % 50).toBe(0);
    expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeGreaterThan(t.kcal - 60);
  });

  it('fat loss: ≤20% / ≤750 kcal deficit with safety floors', () => {
    const t = computeTargets({ ...hriday, activityLevel: 'moderate', goal: 'lose_fat' });
    expect(t.kcal).toBe(2100);
    const small = computeTargets({
      age: 60,
      sex: 'female',
      heightCm: 150,
      weightKg: 50,
      activityLevel: 'sedentary',
      goal: 'lose_fat',
    });
    expect(small.kcal).toBeGreaterThanOrEqual(1200);
    expect(small.kcal).toBeGreaterThanOrEqual(Math.floor(small.bmr / 50) * 50);
  });

  it('never offers a deficit when BMI is under 18.5', () => {
    const t = computeTargets({
      age: 25,
      sex: 'female',
      heightCm: 170,
      weightKg: 50,
      activityLevel: 'light',
      goal: 'lose_fat',
    });
    expect(t.kcal).toBe(Math.round(t.tdee / 50) * 50);
    expect(t.notes.join(' ')).toMatch(/BMI/);
  });

  it('caps protein reference weight for BMI ≥ 30', () => {
    expect(referenceWeightKg(120, 175)).toBeCloseTo(76.6, 1);
    expect(referenceWeightKg(72, 175)).toBe(72);
  });
});

describe('energy', () => {
  it('step energy only counts steps above the 3,000 baseline', () => {
    expect(stepsNetKcal(3000, hriday)).toBe(0);
    expect(stepsNetKcal(8000, hriday)).toBeCloseTo(130.7, 0);
  });

  it('workout kcal is net of resting energy', () => {
    const e = estimateActivity(
      { type: 'strength', intensity: 'moderate', durationMin: 30 },
      hriday,
    );
    expect(e.kcal).toBe(90); // (3.5 − 1) × 72 × 0.5
    expect(e.range.low).toBeLessThan(e.kcal);
    const walk = estimateActivity({ type: 'walk', intensity: 'moderate', distanceKm: 5 }, hriday);
    expect(walk.durationMin).toBe(60);
  });

  it('walk plan corrects the PRD example: ~250 extra kcal ≈ 7 km at a normal pace for 72 kg', () => {
    const p = walkPlan({ targetKcal: 250, weightKg: 72, pace: 'normal' });
    expect(p.distanceKm).toBeCloseTo(6.9, 1);
    expect(p.durationMin).toBe(83);
    const timed = walkPlan({ targetMin: 30, weightKg: 72, pace: 'normal' });
    expect(timed.distanceKm).toBe(2.5);
  });

  const at = (partial: Partial<Activity>): Activity => ({
    date: '2026-10-07',
    startedAt: '2026-10-07T12:00:00.000Z',
    type: 'walk',
    label: 'Walk',
    kcal: 0,
    range: { low: 0, high: 0 },
    source: 'manual',
    confidence: 'medium',
    createdAt: '',
    updatedAt: '',
    ...partial,
  });

  it('expenditure = BMR × 1.2 + steps + workouts, without double-counting logged walks', () => {
    const bmr = 1704;
    const base = dayExpenditure([], hriday, bmr);
    expect(base.expenditure.kcal).toBe(Math.round(bmr * 1.2));
    expect(base.stepsSource).toBe('none');

    const steps = at({ type: 'steps', steps: 8000, label: 'Steps' });
    const gym = at({ type: 'strength', durationMin: 30, kcal: 90 });
    const r = dayExpenditure([steps, gym], hriday, bmr);
    expect(r.expenditure.kcal).toBe(Math.round(bmr * 1.2 + 130.7 + 90));
    expect(r.strengthSessions).toBe(1);

    const walk = at({ type: 'walk', durationMin: 30, kcal: 90, intensity: 'moderate' });
    const withWalk = dayExpenditure([steps, walk], hriday, bmr);
    // The walk's ~3,400 steps are assumed to be inside the 8,000, so total grows by less than 90.
    expect(withWalk.expenditure.kcal - r.expenditure.kcal + 90).toBeLessThan(90);
  });

  it('prefers device active energy when present', () => {
    const device = at({
      type: 'steps',
      steps: 9000,
      kcal: 350,
      source: 'google_health',
      label: 'Steps',
    });
    const manualSteps = at({ type: 'steps', steps: 2000, label: 'Steps' });
    const r = dayExpenditure([device, manualSteps], hriday, 1704);
    expect(r.stepsSource).toBe('device');
    expect(r.steps).toBe(9000);
    expect(r.expenditure.kcal).toBe(Math.round(1704 * 1.1 + 350));
  });

  it('labels balance as roughly balanced when within the uncertainty', () => {
    expect(
      energyBalance({ kcal: 2000, low: 1800, high: 2200 }, { kcal: 2100, low: 1900, high: 2300 })
        .label,
    ).toBe('balanced');
    expect(
      energyBalance({ kcal: 1500, low: 1450, high: 1550 }, { kcal: 2400, low: 2300, high: 2500 })
        .label,
    ).toBe('deficit');
    expect(
      energyBalance({ kcal: 3200, low: 3100, high: 3300 }, { kcal: 2400, low: 2300, high: 2500 })
        .label,
    ).toBe('surplus');
  });
});
