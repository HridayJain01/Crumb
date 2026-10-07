import type { ActivityLevel, Goal, Profile, Sex, Targets } from '../schemas/profile';
import { roundTo } from '../util';

/*
 * Daily targets (documented in docs/estimation.md). Deterministic; the AI never sets targets.
 *  BMR: Mifflin–St Jeor (1990).
 *  TDEE = BMR × activity factor.
 *  Calories by goal with safety floors; protein by g/kg of reference weight; fat 27% of kcal.
 */

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose_fat: 1.6,
  gain_muscle: 1.8,
  improve_fitness: 1.4,
  maintain: 1.2,
  general_health: 1.0,
};

const SEX_CONSTANT: Record<Sex, number> = { male: 5, female: -161, other: -78 };
const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, other: 1350 };
const FAT_SHARE = 0.27;
const MIN_CARBS_G = 100;

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmrMifflin(p: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + SEX_CONSTANT[p.sex];
}

/** Weight used for protein targets; capped at BMI 25 when BMI ≥ 30 to avoid inflated targets. */
export function referenceWeightKg(weightKg: number, heightCm: number): number {
  if (bmi(weightKg, heightCm) < 30) return weightKg;
  const m = heightCm / 100;
  return 25 * m * m;
}

export function computeTargets(
  profile: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activityLevel' | 'goal'>,
): Targets {
  const notes: string[] = [];
  const bmr = bmrMifflin(profile);
  const tdee = bmr * ACTIVITY_FACTOR[profile.activityLevel];
  const userBmi = bmi(profile.weightKg, profile.heightCm);

  let kcal = tdee;
  if (profile.goal === 'lose_fat') {
    if (userBmi < 18.5) {
      notes.push(
        'Your BMI is below 18.5, so we kept calories at maintenance instead of a deficit.',
      );
    } else {
      const deficit = Math.min(tdee * 0.2, 750);
      const floor = Math.max(bmr, KCAL_FLOOR[profile.sex]);
      kcal = Math.max(tdee - deficit, floor);
      if (kcal > tdee - deficit)
        notes.push('Calories are kept at a safe minimum rather than a larger deficit.');
    }
  } else if (profile.goal === 'gain_muscle') {
    kcal = tdee + Math.min(tdee * 0.1, 350);
  }

  const refWeight = referenceWeightKg(profile.weightKg, profile.heightCm);
  if (refWeight < profile.weightKg)
    notes.push('Protein is based on a reference weight for your height.');
  const proteinG = Math.min(PROTEIN_G_PER_KG[profile.goal] * refWeight, 2.2 * refWeight);
  let fatG = (kcal * FAT_SHARE) / 9;
  let carbsG = (kcal - proteinG * 4 - fatG * 9) / 4;
  if (carbsG < MIN_CARBS_G) {
    // Keep a sensible carb minimum by trimming fat (never below 20% of kcal).
    const needed = (MIN_CARBS_G - carbsG) * 4;
    const minFatG = (kcal * 0.2) / 9;
    const newFat = Math.max(minFatG, fatG - needed / 9);
    carbsG += ((fatG - newFat) * 9) / 4;
    fatG = newFat;
  }

  return {
    kcal: roundTo(kcal, 50),
    proteinG: roundTo(proteinG, 5),
    carbsG: roundTo(Math.max(carbsG, 0), 5),
    fatG: roundTo(fatG, 5),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    method: 'v1',
    notes,
  };
}
