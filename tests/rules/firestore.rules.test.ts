import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * The client writes straight to Firestore, so these rules are the API boundary:
 * owner-only access, shape and size limits, and server-only collections.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-crumb-rules',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host,
      port: Number(port),
    },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const iso = '2026-10-07T13:00:00.000Z';
const profile = {
  age: 23,
  sex: 'male',
  heightCm: 175,
  weightKg: 72,
  activityLevel: 'moderate',
  goal: 'gain_muscle',
  diet: 'veg',
  allergies: [],
  units: 'metric',
  timezone: 'Asia/Kolkata',
};
const entry = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-07',
  loggedAt: iso,
  mealType: 'lunch',
  inputType: 'text',
  rawInput: 'two rotis and dal',
  status: 'confirmed',
  items: [{ name: 'Roti' }, { name: 'Dal' }],
  totals: { nutrition: { kcal: 380 } },
  createdAt: iso,
  updatedAt: iso,
  ...over,
});
const activity = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-07',
  startedAt: iso,
  type: 'walk',
  label: 'Walk',
  durationMin: 30,
  kcal: 90,
  range: { low: 60, high: 120 },
  met: 3.5,
  intensity: 'moderate',
  source: 'manual',
  confidence: 'medium',
  createdAt: iso,
  updatedAt: iso,
  ...over,
});

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
}

describe('user profile', () => {
  it('lets people create and read only their own profile', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { profile, createdAt: iso }));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(getDoc(doc(anonymous(), 'users/alice')));
    await assertFails(setDoc(doc(bob(), 'users/alice'), { profile }));
  });

  it('enforces the 18+ age guard and sane body measurements', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { profile: { ...profile, age: 17 } }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { profile: { ...profile, age: 23.5 } }));
    await assertFails(
      setDoc(doc(alice(), 'users/alice'), { profile: { ...profile, heightCm: 40 } }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice'), { profile: { ...profile, goal: 'starve' } }),
    );
  });

  it('rejects unexpected top-level fields', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { profile, isAdmin: true }));
  });
});

describe('food entries', () => {
  it('accepts a well-formed entry from its owner only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/entries/e1'), entry()));
    await assertFails(setDoc(doc(bob(), 'users/alice/entries/e2'), entry()));
    await assertFails(getDocs(collection(bob(), 'users/alice/entries')));
  });

  it('caps sizes so no one can bloat storage', async () => {
    const items = Array.from({ length: 31 }, (_, i) => ({ name: `Item ${i}` }));
    await assertFails(setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ items })));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ thumb: 'x'.repeat(40_001) })),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ rawInput: 'x'.repeat(1001) })),
    );
  });

  it('validates dates, meal types and status', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ date: '7/10/2026' })));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ mealType: 'brunch' })),
    );
    await assertFails(setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ status: 'deleted' })));
    await assertFails(setDoc(doc(alice(), 'users/alice/entries/e1'), entry({ extra: 1 })));
  });
});

describe('activities', () => {
  it('allows manual activities with sane values', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/activities/a1'), activity()));
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/activities/steps-2026-10-07'), {
        ...activity({ type: 'steps', label: 'Steps', steps: 6200 }),
        durationMin: 0,
      }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/activities/a2'), activity({ steps: 200_000 })),
    );
    await assertFails(setDoc(doc(alice(), 'users/alice/activities/a3'), activity({ kcal: -10 })));
  });

  it('never lets the client forge or edit device-synced data', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/activities/gh1'), activity({ source: 'google_health' })),
    );
    await seed('users/alice/activities/gh2', activity({ source: 'google_health', steps: 9000 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice/activities/gh2'), { steps: 20000 }));
    // ...but the owner can still remove it from their journal.
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/activities/gh2')));
  });
});

describe('derived and personal collections', () => {
  it('keeps day summaries keyed by date and owner-only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/days/2026-10-07'), { mealsLogged: 1 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/days/today'), { mealsLogged: 1 }));
    await assertFails(getDoc(doc(bob(), 'users/alice/days/2026-10-07')));
  });

  it('treats corrections as an append-only log', async () => {
    const ref = doc(alice(), 'users/alice/corrections/c1');
    await assertSucceeds(setDoc(ref, { field: 'grams', aiValue: 80, userValue: 120 }));
    await assertFails(updateDoc(ref, { userValue: 10 }));
  });

  it('shares memory and usual meals with no one else', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/memory/roti'), { count: 3 }));
    await assertFails(getDoc(doc(bob(), 'users/alice/memory/roti')));
    await assertFails(setDoc(doc(bob(), 'users/alice/meals/m1'), { label: 'Hijack' }));
  });
});

describe('server-only data', () => {
  it('shows integration status to the owner but only the server writes it', async () => {
    await seed('users/alice/integrations/google_health', { connected: true });
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/integrations/google_health')));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/integrations/google_health'), { connected: false }),
    );
    await assertFails(getDoc(doc(bob(), 'users/alice/integrations/google_health')));
  });

  it('closes tokens, rate limits and ingest tokens to every client', async () => {
    await seed('private/alice/tokens/google_health', { sealed: 'v1.iv.tag.data' });
    await assertFails(getDoc(doc(alice(), 'private/alice/tokens/google_health')));
    await assertFails(setDoc(doc(alice(), 'rateLimits/alice_2026-10-07_ai'), { count: 0 }));
    await assertFails(getDoc(doc(alice(), 'ingestTokens/t1')));
  });
});
