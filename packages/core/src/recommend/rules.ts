import type { Allergen, Diet, Goal } from '../schemas/profile';
import { proteinIdeas, type ProteinIdea } from './food-suggestions';
import { workoutsForGoal, type WorkoutTemplate } from './workouts';

/*
 * Deterministic "what should I do next" engine (PRD §25–31). It picks at most two
 * actions; Gemini may reword the top one but never chooses or invents actions.
 */

export type RecommendationKind =
  | 'protein_gap'
  | 'protein_early'
  | 'room_for_dinner'
  | 'gentle_walk'
  | 'walk_more'
  | 'strength'
  | 'low_intake_care'
  | 'log_first_meal'
  | 'on_track';

export interface Recommendation {
  kind: RecommendationKind;
  priority: number;
  title: string;
  text: string;
  proteinIdeas?: ProteinIdea[];
  walkMinutes?: number;
  workout?: WorkoutTemplate;
}

export interface RecommendationContext {
  hour: number;
  goal: Goal;
  diet: Diet;
  allergies: readonly Allergen[];
  targets: { kcal: number; proteinG: number };
  today: {
    kcal: number;
    proteinG: number;
    steps: number;
    mealsLogged: number;
    strengthSessions: number;
  };
  recent: {
    daysLogged: number;
    avgSteps?: number;
    /** Days since the last strength/HIIT session, if known. */
    daysSinceStrength?: number;
    /** Logged kcal of the last 3 complete days (oldest first). */
    lastDaysKcal?: number[];
  };
}

export function generateRecommendations(ctx: RecommendationContext): Recommendation[] {
  const out: Recommendation[] = [];
  const { hour, today, targets } = ctx;

  // Safety first (PRD §41): persistently very low logged intake → supportive note only.
  const low = ctx.recent.lastDaysKcal;
  if (low && low.length >= 3 && low.every((k) => k > 0 && k < 800)) {
    return [
      {
        kind: 'low_intake_care',
        priority: 100,
        title: 'Looking after yourself',
        text: 'You’ve logged quite little food for a few days. If that’s on purpose, a doctor or registered dietitian can help you plan safely.',
      },
    ];
  }

  if (today.mealsLogged === 0) {
    if (hour >= 10) {
      out.push({
        kind: 'log_first_meal',
        priority: 30,
        title: 'Log your first meal',
        text: 'Snap a photo or just type what you ate — it takes a few seconds.',
      });
    }
  } else {
    const proteinGap = targets.proteinG - today.proteinG;
    if (hour >= 14 && proteinGap >= 15) {
      out.push({
        kind: 'protein_gap',
        priority: 80 + Math.min(proteinGap, 60) / 2,
        title: `About ${Math.round(proteinGap / 5) * 5} g protein to go`,
        text: 'An easy protein-rich snack or dinner side would close most of the gap.',
        proteinIdeas: proteinIdeas(proteinGap, ctx.diet, ctx.allergies),
      });
    } else if (hour < 14 && today.proteinG < targets.proteinG * 0.15 && today.mealsLogged >= 1) {
      out.push({
        kind: 'protein_early',
        priority: 45,
        title: 'Add protein to your next meal',
        text: 'Front-loading a little protein makes the daily target much easier.',
        proteinIdeas: proteinIdeas(20, ctx.diet, ctx.allergies, 3),
      });
    }

    if (hour >= 18 && today.kcal < targets.kcal * 0.6) {
      out.push({
        kind: 'room_for_dinner',
        priority: 55,
        title: 'Room for a proper dinner',
        text: 'You’re well under your usual intake today — a balanced dinner with protein fits nicely.',
      });
    }
    if (hour >= 17 && ctx.goal === 'lose_fat' && today.kcal > targets.kcal * 1.15) {
      out.push({
        kind: 'gentle_walk',
        priority: 50,
        title: 'A relaxed walk could help',
        text: 'You’re a little above your target today. A 20–30 minute walk is an easy way to balance it — no need to cut meals.',
        walkMinutes: 25,
      });
    }
  }

  const stepBaseline =
    ctx.recent.avgSteps && ctx.recent.daysLogged >= 3 ? ctx.recent.avgSteps : 5000;
  if (hour >= 17 && today.steps < stepBaseline * 0.7) {
    const short = Math.max(0, stepBaseline - today.steps);
    out.push({
      kind: 'walk_more',
      priority: 65,
      title: 'Fancy a short walk?',
      text:
        today.steps > 0
          ? `You’re at ${today.steps.toLocaleString('en-IN')} steps — a 20-minute walk adds roughly ${Math.min(2500, Math.round(short / 100) * 100).toLocaleString('en-IN')}.`
          : 'A 20-minute walk is a simple way to get moving today.',
      walkMinutes: 20,
    });
  }

  if (
    ctx.goal === 'gain_muscle' &&
    today.strengthSessions === 0 &&
    (ctx.recent.daysSinceStrength === undefined
      ? ctx.recent.daysLogged >= 3
      : ctx.recent.daysSinceStrength >= 3)
  ) {
    const workout =
      workoutsForGoal('gain_muscle').find((w) => w.id === 'strength30') ??
      workoutsForGoal('gain_muscle')[0];
    out.push({
      kind: 'strength',
      priority: 60,
      title: 'Strength session today?',
      text: 'It’s been a few days — a 30-minute bodyweight session keeps muscle gain on track.',
      workout,
    });
  }

  if (!out.length) {
    const early = hour < 14 && today.mealsLogged > 0;
    out.push({
      kind: 'on_track',
      priority: 10,
      title: early ? 'Good start' : 'You’re on track',
      text: early
        ? 'Plenty of day left — including some protein in your next meals keeps you on course.'
        : 'Nice and steady today. Keep logging as you go.',
    });
  }

  // De-duplicate kinds, keep the top two (PRD §31: "one or two highest-value actions").
  const seen = new Set<RecommendationKind>();
  return out
    .sort((a, b) => b.priority - a.priority)
    .filter((r) => (seen.has(r.kind) ? false : (seen.add(r.kind), true)))
    .slice(0, 2);
}

/** Template wording used when AI is unavailable (and as the AI's factual basis). */
export function templateInsight(
  ctx: RecommendationContext,
  top: Recommendation | undefined,
): { insight: string; action: string } {
  const kcalPct = ctx.targets.kcal ? ctx.today.kcal / ctx.targets.kcal : 0;
  const proteinGap = Math.round(ctx.targets.proteinG - ctx.today.proteinG);
  let insight: string;
  if (ctx.today.mealsLogged === 0) insight = 'Nothing logged yet today.';
  else if (kcalPct > 1.1)
    insight = `You’re a little above your calorie target today (~${Math.round(kcalPct * 100)}%).`;
  else if (kcalPct >= 0.85) insight = 'You’re close to your calorie target today.';
  else insight = `You’re at about ${Math.round(kcalPct * 100)}% of your calorie target so far.`;
  if (ctx.today.mealsLogged > 0) {
    insight +=
      proteinGap > 5 ? ` Protein is ~${proteinGap} g below target.` : ' Protein is on track.';
  }
  return { insight, action: top ? `${top.title}. ${top.text}` : 'Keep going — log as you eat.' };
}
