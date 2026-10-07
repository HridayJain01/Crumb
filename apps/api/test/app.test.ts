import { describe, expect, it } from 'vitest';
import { InterpretMealResponseSchema, WalkRoutesResponseSchema } from '@crumb/core';
import { AiUnavailableError, type AiClient } from '../src/ai/types';
import { createMockAiClient } from '../src/ai/mock';
import { decryptSecret } from '../src/crypto';
import { json, makeTestApp, mealBody, TEST_KEYS } from './helpers';

function aiReturning(value: unknown): AiClient {
  const base = createMockAiClient();
  return {
    ...base,
    interpretMeal: async () => ({ value, model: 'fake', latencyMs: 1 }),
    wordInsight: async () => ({ value, model: 'fake', latencyMs: 1 }),
  };
}

function aiFailing(quota: boolean): AiClient {
  const fail = async () => {
    throw new AiUnavailableError(quota, ['m: x']);
  };
  return { provider: 'mock', interpretMeal: fail, interpretActivity: fail, wordInsight: fail };
}

describe('auth and basics', () => {
  it('health check is public', async () => {
    const { call } = makeTestApp();
    const res = await call('GET', '/api/health', undefined, null);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, ai: 'mock' });
  });

  it('rejects requests without a valid ID token', async () => {
    const { app, call } = makeTestApp();
    expect((await call('POST', '/api/meals/interpret', mealBody('dal'), null)).status).toBe(401);
    const res = await app.request('/api/meals/interpret', {
      method: 'POST',
      headers: { Authorization: 'Bearer forged', 'Content-Type': 'application/json' },
      body: JSON.stringify(mealBody('dal')),
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      error: { code: 'unauthenticated', message: 'Please sign in again.' },
    });
  });

  it('validates request bodies', async () => {
    const { call } = makeTestApp();
    const res = await call('POST', '/api/meals/interpret', { localTime: 'x', timezone: 'UTC' });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('bad_request');
  });

  it('unknown routes are 404 for public paths', async () => {
    const { call } = makeTestApp();
    expect((await call('GET', '/api/nope', undefined, 'alice')).status).toBe(404);
  });
});

describe('POST /api/meals/interpret', () => {
  it('returns a validated interpretation for the demo sentence', async () => {
    const { call } = makeTestApp();
    const res = await call(
      'POST',
      '/api/meals/interpret',
      mealBody('I had milk, two bananas, three rotis, paneer sabzi and dal.'),
    );
    expect(res.status).toBe(200);
    const body = InterpretMealResponseSchema.parse(await json(res));
    expect(body.interpretation.meals[0]!.items.map((i) => i.quantity)).toEqual([1, 2, 3, 1, 1]);
  });

  it('sanitizes hostile model output before it leaves the server', async () => {
    const { call } = makeTestApp({
      ai: aiReturning({
        status: 'ok',
        totalKcal: 1,
        meals: [
          {
            mealType: 'lunch',
            items: [{ name: 'Roti', quantity: 1e9, unit: 'barrel', kcal: 9999 }],
          },
        ],
      }),
    });
    const res = await call('POST', '/api/meals/interpret', mealBody('roti'));
    const text = await res.text();
    expect(text).not.toMatch(/9999|totalKcal|barrel/);
    const body = InterpretMealResponseSchema.parse(JSON.parse(text));
    expect(body.interpretation.meals[0]!.items[0]!.quantity).toBe(50);
  });

  it('maps AI outages to 503 and quota exhaustion to 429 so the client can fall back', async () => {
    const down = makeTestApp({ ai: aiFailing(false) });
    const r1 = await down.call('POST', '/api/meals/interpret', mealBody('dal'));
    expect(r1.status).toBe(503);
    expect((await json(r1)).error.code).toBe('ai_unavailable');
    const quota = makeTestApp({ ai: aiFailing(true) });
    const r2 = await quota.call('POST', '/api/meals/interpret', mealBody('dal'));
    expect(r2.status).toBe(429);
    expect((await json(r2)).error.code).toBe('ai_quota');
  });

  it('enforces the per-user daily AI cap', async () => {
    const { call } = makeTestApp({ env: { AI_USER_DAILY_LIMIT: '2' } });
    expect((await call('POST', '/api/meals/interpret', mealBody('dal'))).status).toBe(200);
    expect((await call('POST', '/api/meals/interpret', mealBody('dal'))).status).toBe(200);
    const third = await call('POST', '/api/meals/interpret', mealBody('dal'));
    expect(third.status).toBe(429);
    expect((await json(third)).error.code).toBe('rate_limited');
    // Another user is unaffected.
    expect((await call('POST', '/api/meals/interpret', mealBody('dal'), 'bob')).status).toBe(200);
  });

  it('accepts a photo and returns photo-style estimates', async () => {
    const { call } = makeTestApp();
    const res = await call('POST', '/api/meals/interpret', {
      imageBase64: Buffer.from('fake-jpeg').toString('base64'),
      imageMimeType: 'image/jpeg',
      localTime: '2026-10-07T13:20',
      timezone: 'Asia/Kolkata',
    });
    expect(res.status).toBe(200);
    const body = InterpretMealResponseSchema.parse(await json(res));
    expect(body.interpretation.meals[0]!.items.length).toBeGreaterThan(2);
    expect(body.interpretation.meals[0]!.items.every((i) => i.estimatedGrams !== null)).toBe(true);
  });
});

describe('POST /api/activity/interpret', () => {
  it('parses a workout description', async () => {
    const { call } = makeTestApp();
    const res = await call('POST', '/api/activity/interpret', {
      text: '30-minute upper-body workout',
    });
    expect(res.status).toBe(200);
    expect((await json(res)).interpretation.activities[0]).toMatchObject({
      type: 'strength',
      durationMin: 30,
    });
  });
});

describe('POST /api/insights', () => {
  const context = {
    goal: 'gain_muscle',
    diet: 'veg',
    localHour: 15,
    today: {
      kcal: 1500,
      kcalTarget: 2400,
      proteinG: 70,
      proteinTarget: 125,
      steps: 6200,
      mealsLogged: 2,
    },
    commonFoods: ['paneer', 'dal'],
    chosenAction: { kind: 'protein_gap', text: 'Add a protein-rich snack like paneer or dahi.' },
  };

  it('uses AI wording when valid', async () => {
    const { call } = makeTestApp({
      ai: aiReturning({
        insight: 'You’re ~55 g short on protein.',
        action: 'A bowl of hung curd would help.',
      }),
    });
    const res = await call('POST', '/api/insights', { kind: 'daily', context });
    expect(await json(res)).toEqual({
      insight: 'You’re ~55 g short on protein.',
      action: 'A bowl of hung curd would help.',
      source: 'ai',
    });
  });

  it('falls back to a template when AI shames, fails or is capped', async () => {
    const shaming = makeTestApp({
      ai: aiReturning({ insight: 'You failed today.', action: 'Do better.' }),
    });
    const r1 = await json(await shaming.call('POST', '/api/insights', { kind: 'daily', context }));
    expect(r1.source).toBe('template');
    expect(r1.insight).toMatch(/protein ~55 g below target/);
    expect(r1.action).toBe(context.chosenAction.text);

    const down = makeTestApp({ ai: aiFailing(false) });
    expect(
      (await json(await down.call('POST', '/api/insights', { kind: 'daily', context }))).source,
    ).toBe('template');

    const capped = makeTestApp({ env: { AI_USER_DAILY_LIMIT: '1' } });
    await capped.call('POST', '/api/insights', { kind: 'daily', context });
    const r3 = await capped.call('POST', '/api/insights', { kind: 'daily', context });
    expect(r3.status).toBe(200);
    expect((await json(r3)).source).toBe('template');
  });
});

describe('POST /api/walk/routes', () => {
  const origin = { lat: 19.076, lng: 72.8777 };

  it('returns two measured loops near the target distance with honest kcal ranges', async () => {
    const { call } = makeTestApp();
    const res = await call('POST', '/api/walk/routes', { origin, targetKcal: 150, weightKg: 72 });
    expect(res.status).toBe(200);
    const body = WalkRoutesResponseSchema.parse(await json(res));
    expect(body.options).toHaveLength(2);
    for (const o of body.options) {
      expect(o.measured).toBe(true);
      expect(Math.abs(o.distanceKm - body.targetKm) / body.targetKm).toBeLessThan(0.2);
      expect(o.kcal.low).toBeLessThan(o.kcal.estimate);
      expect(o.mapsUrl).toContain('travelmode=walking');
      expect(o.warnings.length).toBeGreaterThan(0);
    }
    expect(body.disclaimer).toMatch(/Check the route/);
  });

  it('still answers with an estimate when routing fails', async () => {
    const { call } = makeTestApp({
      routes: {
        measured: true,
        walkingLoop: async () => {
          throw new Error('down');
        },
      },
    });
    const body = WalkRoutesResponseSchema.parse(
      await json(await call('POST', '/api/walk/routes', { origin, targetMin: 30, weightKg: 72 })),
    );
    expect(body.options.every((o) => !o.measured)).toBe(true);
    expect(body.options[0]!.distanceKm).toBe(2.5);
  });

  it('requires a target', async () => {
    const { call } = makeTestApp();
    expect((await call('POST', '/api/walk/routes', { origin, weightKg: 72 })).status).toBe(400);
  });
});

describe('Google Health integration', () => {
  it('reports not configured without keys', async () => {
    const { call } = makeTestApp();
    expect((await call('GET', '/api/integrations/google-health/start')).status).toBe(501);
  });

  it('connects via signed state, stores the token encrypted, syncs and disconnects', async () => {
    const { call, app, store } = makeTestApp({ env: TEST_KEYS });
    const start = await json(await call('GET', '/api/integrations/google-health/start'));
    const redirect = new URL(start.authUrl, 'https://crumb.test');
    const callback = await app.request(`${redirect.pathname}${redirect.search}`);
    expect(callback.status).toBe(302);
    expect(callback.headers.get('Location')).toBe(
      'https://crumb.test/profile?integration=google_health&status=connected',
    );

    const sealed = (store.dump().tokens as Record<string, string>)['alice/google_health']!;
    expect(sealed).not.toContain('mock-refresh-token');
    expect(decryptSecret(sealed, TEST_KEYS.TOKEN_ENC_KEY)).toBe('mock-refresh-token');

    const sync = await call('POST', '/api/integrations/google-health/sync', {
      from: '2026-10-01',
      to: '2026-10-07',
      timezone: 'Asia/Kolkata',
    });
    expect(sync.status).toBe(200);
    expect(await json(sync)).toMatchObject({ imported: 7 });
    const activities = store.dump().activities as Record<string, { source: string; type: string }>;
    expect(activities['alice/gh-steps-2026-10-07']).toMatchObject({
      source: 'google_health',
      type: 'steps',
    });

    expect((await call('DELETE', '/api/integrations/google-health')).status).toBe(204);
    expect((store.dump().tokens as Record<string, string>)['alice/google_health']).toBeUndefined();
  });

  it('rejects a forged or expired state', async () => {
    const { app } = makeTestApp({ env: TEST_KEYS });
    const res = await app.request(
      '/api/integrations/google-health/callback?code=x&state=YWxpY2U.1.n.sig',
    );
    expect(res.headers.get('Location')).toMatch(/status=expired/);
  });

  it('sync without a connection is a clear 409', async () => {
    const { call } = makeTestApp({ env: TEST_KEYS });
    const res = await call('POST', '/api/integrations/google-health/sync', {
      from: '2026-10-01',
      to: '2026-10-07',
      timezone: 'UTC',
    });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/account', () => {
  it('removes server-side data and the auth user', async () => {
    const { call, store, auth } = makeTestApp({ env: TEST_KEYS });
    await store.putSealedToken('alice', 'google_health', 'sealed');
    await store.upsertActivities('alice', [
      {
        id: 'a1',
        date: '2026-10-07',
        startedAt: '',
        type: 'steps',
        label: 'x',
        kcal: 0,
        range: { low: 0, high: 0 },
        source: 'google_health',
        confidence: 'medium',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    const res = await call('DELETE', '/api/account');
    expect(res.status).toBe(204);
    expect(store.dump().tokens).toEqual({});
    expect(store.dump().activities).toEqual({});
    expect(auth.deleted).toEqual(['alice']);
  });
});
