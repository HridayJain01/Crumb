/**
 * Seeds a clearly labelled, generated SAMPLE history so insights, streaks, food memory and
 * usual meals can be shown in a demo without waiting weeks for real data.
 *
 *   pnpm seed:demo
 *       Local emulators: creates the sample account sample@crumb.test (password
 *       "crumb-sample") and 21 days of history. Use "Sample account" on the welcome screen.
 *
 *   pnpm seed:demo --project my-project --email you@gmail.com --yes [--reset]
 *       A real project (Application Default Credentials): adds the history to YOUR account.
 *       The person must have signed in once. Entries are tagged aiModel="sample-data" and the
 *       app shows a "Sample history" label, so it is never mistaken for real health data.
 *
 * Every number is computed by @crumb/core exactly as the app computes it.
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  addDays,
  computeTargets,
  estimateActivity,
  mealSignature,
  memoryKeyFor,
  stepsNetKcal,
  sumItems,
  summarizeDay,
  toDateKey,
  updateFoodMemory,
  buildManualItem,
  type Activity,
  type FoodEntry,
  type FoodItem,
  type FoodMemory,
  type MealTemplate,
  type MealType,
  type Profile,
  type Unit,
  type WorkoutType,
} from '@crumb/core';
import { getFoodDb } from '@crumb/core/foods';

const SAMPLE_EMAIL = 'sample@crumb.test';
const SAMPLE_PASSWORD = 'crumb-sample';
const SAMPLE_MODEL = 'sample-data';

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    email: { type: 'string' },
    uid: { type: 'string' },
    days: { type: 'string', default: '21' },
    seed: { type: 'string', default: '7' },
    reset: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
});

const useEmulators = !args.project;
if (useEmulators) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.METADATA_SERVER_DETECTION ??= 'none';
} else if (!args.yes || !(args.email || args.uid)) {
  console.error('For a real project pass --email (or --uid) and --yes. Nothing was written.');
  process.exit(1);
}

const projectId = args.project ?? 'demo-crumb';
initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

const SAMPLE_PROFILE: Profile = {
  name: 'Aarav',
  age: 27,
  sex: 'male',
  heightCm: 174,
  weightKg: 70,
  activityLevel: 'light',
  goal: 'gain_muscle',
  diet: 'veg',
  allergies: [],
  units: 'metric',
  timezone: 'Asia/Kolkata',
};

type Portion = [foodId: string, quantity: number, unit?: Unit];

// Typical home-style vegetarian days; breakfast is the lowest-protein meal on purpose so
// the insights have something gentle to point out.
const MEALS: Record<MealType, { hour: number; options: Portion[][] }> = {
  breakfast: {
    hour: 8,
    options: [
      [
        ['poha', 1],
        ['chai', 1],
      ],
      [
        ['oats_porridge', 1],
        ['banana', 1],
        ['almonds', 1],
      ],
      [
        ['aloo_paratha', 2],
        ['curd', 1],
        ['chai', 1],
      ],
      [
        ['paneer_paratha', 2],
        ['curd', 1],
      ],
      [
        ['upma', 1],
        ['chai', 1],
        ['banana', 1],
      ],
    ],
  },
  lunch: {
    hour: 13,
    options: [
      [
        ['roti', 3],
        ['dal', 1],
        ['mixed_veg', 1],
        ['white_rice', 1],
        ['curd', 1],
      ],
      [
        ['rajma', 1.5],
        ['white_rice', 1.5],
        ['raita', 1],
      ],
      [
        ['roti', 3],
        ['paneer_sabzi', 1],
        ['dal', 1],
        ['salad', 1],
      ],
      [
        ['chole', 1.5],
        ['roti', 3],
        ['salad', 1],
      ],
      [
        ['veg_pulao', 1.5],
        ['raita', 1],
        ['soya_curry', 1],
      ],
    ],
  },
  snack: {
    hour: 17,
    options: [
      [
        ['chai', 1],
        ['biscuits', 2],
      ],
      [
        ['apple', 1],
        ['almonds', 1],
      ],
      [
        ['roasted_chana', 1],
        ['buttermilk', 1],
      ],
      [
        ['banana', 1],
        ['peanuts', 1],
      ],
      [
        ['makhana', 1],
        ['milk_toned', 1],
      ],
      [['sprouts', 1]],
    ],
  },
  dinner: {
    hour: 21,
    options: [
      [
        ['roti', 3],
        ['palak_paneer', 1.5],
        ['dal', 1],
      ],
      [
        ['khichdi', 1.5],
        ['curd', 1],
      ],
      [
        ['roti', 3],
        ['bhindi', 1],
        ['dal', 1],
        ['curd', 1],
      ],
      [
        ['masala_dosa', 2],
        ['sambar', 1],
      ],
      [
        ['roti', 3],
        ['soya_curry', 1.5],
        ['curd', 1],
      ],
      [
        ['paneer_tikka', 1],
        ['roti', 2],
        ['dal', 1],
      ],
    ],
  },
};
const USUAL_BREAKFAST: Portion[] = [
  ['idli', 3],
  ['sambar', 1],
  ['coconut_chutney', 1],
];
const POST_WORKOUT: Portion[] = [
  ['whey', 1],
  ['milk_toned', 1],
];
const WEEKEND_TREATS: Portion[][] = [
  [
    ['pav_bhaji', 1],
    ['lassi', 1],
  ],
  [
    ['veg_biryani', 1],
    ['raita', 1],
  ],
  [
    ['pizza', 3],
    ['cold_coffee', 1],
  ],
];

/** Small deterministic PRNG so the same seed always produces the same history. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(Number(args.seed));
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

/** Minutes east of UTC for `tz` at `at`. */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((wall - at.getTime()) / 60_000);
}

/** The UTC instant for a local wall-clock time in `tz` (two passes handle DST edges). */
function instant(date: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - tzOffsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

function describe(items: FoodItem[]): string {
  return items
    .map((i) => `${i.quantity} ${i.unit === 'piece' ? '' : `${i.unit} `}${i.name}`.toLowerCase())
    .join(', ');
}

async function resolveUser(): Promise<{ uid: string; created: boolean }> {
  if (args.uid) return { uid: args.uid, created: false };
  const email = args.email ?? SAMPLE_EMAIL;
  try {
    return { uid: (await auth.getUserByEmail(email)).uid, created: false };
  } catch (err) {
    if (!useEmulators)
      throw new Error(`No user with ${email}; sign in to the app once first.`, { cause: err });
    const user = await auth.createUser({
      email,
      password: SAMPLE_PASSWORD,
      displayName: 'Sample account',
    });
    return { uid: user.uid, created: true };
  }
}

async function writeAll(firestore: Firestore, writes: [DocumentReference, object][]) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = firestore.batch();
    for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data);
    await batch.commit();
  }
}

async function main() {
  const foods = getFoodDb();
  const { uid, created } = await resolveUser();
  const userRef = db.doc(`users/${uid}`);
  const existing = (await userRef.get()).data() as { profile?: Profile } | undefined;
  const profile = existing?.profile ?? SAMPLE_PROFILE;
  const targets = computeTargets(profile);
  const tz = profile.timezone || 'Asia/Kolkata';

  if (args.reset) {
    for (const sub of [
      'entries',
      'activities',
      'days',
      'memory',
      'meals',
      'corrections',
      'insights',
    ]) {
      await db.recursiveDelete(userRef.collection(sub));
    }
  } else if (!(await userRef.collection('entries').limit(1).get()).empty) {
    console.error('This account already has entries. Re-run with --reset to replace its history.');
    process.exit(1);
  }

  const today = toDateKey(new Date(), tz);
  const days = Math.min(60, Math.max(3, Number(args.days)));
  const memory = new Map<string, FoodMemory>();
  const writes: [DocumentReference, object][] = [];
  const usualDays: string[] = [];
  let usualItems: FoodItem[] = [];
  let entryCount = 0;
  const totals = { days: 0, kcal: 0, proteinG: 0 };

  for (let back = days; back >= 1; back--) {
    const date = addDays(today, -back);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    // Two quiet days (life happens), never in the last week so the streak looks real.
    if (back === days - 3 || back === days - 9) continue;

    const entries: FoodEntry[] = [];
    for (const mealType of ['breakfast', 'lunch', 'snack', 'dinner'] as const) {
      if (mealType === 'snack' && rand() < 0.25 && weekday !== 1 && weekday !== 4) continue;
      if (mealType === 'lunch' && rand() < 0.08) continue;
      const usual = mealType === 'breakfast' && !weekend && rand() < 0.45;
      const gymDay = weekday === 1 || weekday === 4;
      const plan: Portion[] = usual
        ? USUAL_BREAKFAST
        : mealType === 'dinner' && weekend
          ? pick(WEEKEND_TREATS)
          : mealType === 'snack' && gymDay
            ? POST_WORKOUT
            : pick(MEALS[mealType].options);
      // A glass of milk at night on some days.
      const withMilk = mealType === 'dinner' && !weekend && rand() < 0.4;
      const at = instant(date, MEALS[mealType].hour, between(0, 45), tz);
      const items = [...plan, ...(withMilk ? ([['milk_toned', 1]] as Portion[]) : [])].map(
        ([id, quantity, unit]) => {
          const food = foods.byId.get(id);
          if (!food) throw new Error(`Unknown food id in sample plan: ${id}`);
          const key = memoryKeyFor(food.name, food.id);
          return buildManualItem(food, { quantity, unit, memory: memory.get(key) });
        },
      );
      for (const item of items) {
        const key = memoryKeyFor(item.name, item.foodId);
        memory.set(key, updateFoodMemory(memory.get(key), item, mealType, at, false));
      }
      if (usual) {
        usualDays.push(date);
        usualItems = items;
      }
      const iso = at.toISOString();
      const entry: FoodEntry = {
        date,
        loggedAt: iso,
        mealType,
        inputType: usual && usualDays.length > 3 ? 'quick' : rand() < 0.2 ? 'photo' : 'text',
        rawInput: describe(items),
        status: 'confirmed',
        items,
        totals: sumItems(items),
        aiModel: SAMPLE_MODEL,
        createdAt: iso,
        updatedAt: iso,
      };
      entries.push(entry);
      writes.push([userRef.collection('entries').doc(), entry]);
      entryCount++;
    }

    const activities: Activity[] = [];
    if (rand() < 0.85) {
      const steps = weekend ? between(3500, 11000) : between(4800, 8800);
      const kcal = Math.round(stepsNetKcal(steps, profile));
      const iso = instant(date, 22, 0, tz).toISOString();
      const activity: Activity = {
        date,
        startedAt: `${date}T00:00:00.000Z`,
        type: 'steps',
        label: 'Steps',
        steps,
        kcal,
        range: { low: Math.round(kcal * 0.75), high: Math.round(kcal * 1.25) },
        source: 'manual',
        confidence: 'medium',
        createdAt: iso,
        updatedAt: iso,
      };
      activities.push(activity);
      writes.push([userRef.collection('activities').doc(`steps-${date}`), activity]);
    }
    const workout: [WorkoutType, string, number] | null =
      weekday === 1 || weekday === 4
        ? ['strength', 'Gym / strength', between(35, 50)]
        : weekday === 6
          ? ['yoga', 'Yoga', 30]
          : rand() < 0.25
            ? ['walk', 'Walk', between(20, 40)]
            : null;
    if (workout) {
      const [type, label, durationMin] = workout;
      const est = estimateActivity({ type, intensity: 'moderate', durationMin }, profile);
      const iso = instant(date, 19, 0, tz).toISOString();
      const activity: Activity = {
        date,
        startedAt: iso,
        type,
        label,
        durationMin: est.durationMin,
        distanceKm: est.distanceKm,
        kcal: est.kcal,
        range: est.range,
        met: est.met,
        intensity: 'moderate',
        source: 'manual',
        confidence: est.confidence,
        createdAt: iso,
        updatedAt: iso,
      };
      activities.push(activity);
      writes.push([userRef.collection('activities').doc(), activity]);
    }

    const now = instant(date, 23, 59, tz);
    const summary = summarizeDay({ date, entries, activities, profile, now });
    writes.push([userRef.collection('days').doc(date), summary]);
    totals.days++;
    totals.kcal += summary.intake.kcal;
    totals.proteinG += summary.intake.proteinG;
  }

  for (const [key, mem] of memory) writes.push([userRef.collection('memory').doc(key), mem]);
  if (usualDays.length >= 3) {
    const template: MealTemplate = {
      label: 'Your usual breakfast',
      signature: mealSignature(usualItems),
      mealType: 'breakfast',
      items: usualItems,
      count: usualDays.length,
      typicalHour: MEALS.breakfast.hour,
      lastUsed: instant(usualDays.at(-1)!, 8, 15, tz).toISOString(),
      source: 'auto',
    };
    writes.push([userRef.collection('meals').doc(), template]);
  }

  const nowIso = new Date().toISOString();
  const userDoc = existing?.profile
    ? { settings: { sampleDataSince: nowIso }, updatedAt: nowIso }
    : {
        profile,
        targets,
        settings: { onboardedAt: nowIso, sampleDataSince: nowIso },
        createdAt: nowIso,
        updatedAt: nowIso,
      };
  await userRef.set(userDoc, { merge: true });
  await writeAll(db, writes);

  console.log(
    [
      `Seeded ${entryCount} sample meals over ${days} days for ${useEmulators ? 'the local emulator' : projectId}.`,
      `Usual breakfast repeated ${usualDays.length}× · ${memory.size} remembered foods.`,
      `Average ~${(Math.round(totals.kcal / totals.days / 50) * 50).toLocaleString('en-IN')} kcal and ~${Math.round(totals.proteinG / totals.days)} g protein a day (targets ~${targets.kcal.toLocaleString('en-IN')} kcal, ~${targets.proteinG} g).`,
      useEmulators
        ? `Sign in with “Sample account” on the welcome screen (${SAMPLE_EMAIL}${created ? ', created now' : ''}).`
        : 'Open the app signed in as that account. The history is labelled as sample data.',
    ].join('\n'),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
