import { describe, expect, it } from 'vitest';
import { ApiError } from '@google/genai';
import { createGeminiClient, type GenerateContent } from '../src/ai/gemini';
import { AiUnavailableError } from '../src/ai/types';
import { decryptSecret, encryptSecret, signState, verifyState } from '../src/crypto';
import { loadEnv } from '../src/env';
import { silentLogger } from '../src/log';
import { createGoogleHealthProvider, pointDate, pointValue } from '../src/providers/health';
import { createGoogleRoutesClient } from '../src/providers/routes';
import { TEST_KEYS } from './helpers';

describe('crypto', () => {
  it('round-trips sealed secrets and detects tampering', () => {
    const sealed = encryptSecret('refresh-123', TEST_KEYS.TOKEN_ENC_KEY);
    expect(decryptSecret(sealed, TEST_KEYS.TOKEN_ENC_KEY)).toBe('refresh-123');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(() => decryptSecret(tampered, TEST_KEYS.TOKEN_ENC_KEY)).toThrow();
  });

  it('signs and verifies OAuth state with expiry', () => {
    const now = 1_700_000_000_000;
    const state = signState('alice', 's3cret', now);
    expect(verifyState(state, 's3cret', now + 1000)).toBe('alice');
    expect(verifyState(state, 'other', now + 1000)).toBeNull();
    expect(verifyState(state, 's3cret', now + 11 * 60_000)).toBeNull();
    expect(verifyState(state.replace(/\.[^.]+$/, '.AAAA'), 's3cret', now)).toBeNull();
  });
});

describe('Gemini client model fallback', () => {
  const env = loadEnv({
    AI_PROVIDER: 'gemini-api',
    GEMINI_API_KEY: 'k',
    AI_MODEL_TEXT: 'm1',
    AI_FALLBACK_MODELS: 'm2,m3',
  });
  const req = { text: 'dal', localTime: 't', timezone: 'UTC', memoryHints: [] };

  function sdk(behaviour: Record<string, () => unknown>): GenerateContent & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      generateContent: (async (params: {
        model: string;
        config?: { responseSchema?: unknown };
      }) => {
        calls.push(params.model);
        const out = behaviour[params.model]?.();
        return out as never;
      }) as GenerateContent['generateContent'],
    };
  }

  it('falls through quota errors and bad JSON to the next model', async () => {
    const fake = sdk({
      m1: () => {
        throw new ApiError({ message: 'quota', status: 429 });
      },
      m2: () => ({ text: '{not json' }),
      m3: () => ({
        text: '{"status":"ok","imageIssue":null,"meals":[],"clarifyingQuestion":null}',
      }),
    });
    const client = createGeminiClient(env, silentLogger, fake);
    const result = await client.interpretMeal(req);
    expect(fake.calls).toEqual(['m1', 'm2', 'm3']);
    expect(result.model).toBe('m3');
  });

  it('reports quota exhaustion when every model is rate-limited', async () => {
    const quota = () => {
      throw new ApiError({ message: 'quota', status: 429 });
    };
    const client = createGeminiClient(env, silentLogger, sdk({ m1: quota, m2: quota, m3: quota }));
    await expect(client.interpretMeal(req)).rejects.toSatisfy(
      (e: unknown) => e instanceof AiUnavailableError && e.quota,
    );
  });

  it('sends a structured-output schema with the request', async () => {
    let seen: unknown;
    const fake: GenerateContent = {
      generateContent: (async (params: {
        config?: { responseSchema?: unknown; responseMimeType?: string };
      }) => {
        seen = params.config;
        return { text: '{"insight":"a","action":"b"}' };
      }) as unknown as GenerateContent['generateContent'],
    };
    await createGeminiClient(env, silentLogger, fake).wordInsight('daily', {
      goal: 'maintain',
      diet: 'any',
      localHour: 12,
      today: { kcal: 1, kcalTarget: 2, proteinG: 1, proteinTarget: 2, steps: 0, mealsLogged: 1 },
      commonFoods: [],
      chosenAction: { kind: 'on_track', text: 'Keep going' },
    });
    expect(seen).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT' },
    });
  });
});

describe('Google Health response parsing', () => {
  it('reads dates and values from rollup points', () => {
    const p = {
      civilStartTime: { date: { year: 2026, month: 10, day: 7 } },
      steps: { countSum: '8123' },
    };
    expect(pointDate(p)).toBe('2026-10-07');
    expect(pointValue(p, /count|sum/i)).toEqual({ key: 'countSum', value: 8123 });
    expect(pointDate({ startTime: '2026-10-06T00:00:00Z' })).toBe('2026-10-06');
  });

  it('exchanges tokens and merges steps + active energy per day', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: { body?: unknown }) => {
      calls.push(String(url));
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'acc', refresh_token: 'ref' }));
      }
      const body = JSON.parse(String(init?.body));
      expect(body.windowSizeDays).toBe(1);
      expect(body.range.start.date).toEqual({ year: 2026, month: 10, day: 6 });
      if (String(url).includes('/steps/')) {
        return new Response(
          JSON.stringify({
            rollupDataPoints: [
              {
                civilStartTime: { date: { year: 2026, month: 10, day: 6 } },
                steps: { countSum: 9000 },
              },
            ],
          }),
        );
      }
      if (String(url).includes('/active-energy-burned/')) {
        return new Response(
          JSON.stringify({
            rollupDataPoints: [
              {
                civilStartTime: { date: { year: 2026, month: 10, day: 6 } },
                activeEnergyBurned: { kcalSum: 321.4 },
              },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ rollupDataPoints: [] }));
    }) as typeof fetch;
    const provider = createGoogleHealthProvider({
      clientId: 'c',
      clientSecret: 's',
      redirectUri: 'https://x/cb',
      fetchImpl: fakeFetch,
    });
    expect(provider.authUrl('st')).toContain('googlehealth.activity_and_fitness.readonly');
    expect(await provider.exchangeCode('code')).toEqual({ refreshToken: 'ref' });
    const days = await provider.daily('ref', '2026-10-06', '2026-10-07');
    expect(days).toEqual([{ date: '2026-10-06', steps: 9000, activeKcal: 321 }]);
    expect(calls.some((u) => u.endsWith('/steps/dataPoints:dailyRollUp'))).toBe(true);
  });
});

describe('Routes API client', () => {
  it('requests a WALK loop with a field mask and parses distance/duration', async () => {
    let request:
      | { headers: Record<string, string>; body: { travelMode: string; intermediates: unknown[] } }
      | undefined;
    const fakeFetch = (async (
      _url: string,
      init: { headers: Record<string, string>; body: string },
    ) => {
      request = { headers: init.headers, body: JSON.parse(init.body) };
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 3120,
              duration: '2390s',
              polyline: { encodedPolyline: 'abc' },
              warnings: ['Walking directions are in beta.'],
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const client = createGoogleRoutesClient('server-key', fakeFetch);
    const route = await client.walkingLoop({ lat: 1, lng: 2 }, [
      { lat: 1.01, lng: 2 },
      { lat: 1.01, lng: 2.01 },
      { lat: 1, lng: 2.01 },
    ]);
    expect(request?.headers['X-Goog-FieldMask']).toContain('routes.distanceMeters');
    expect(request?.body.travelMode).toBe('WALK');
    expect(request?.body.intermediates).toHaveLength(3);
    expect(route).toEqual({
      distanceKm: 3.12,
      durationMin: 2390 / 60,
      polyline: 'abc',
      warnings: ['Walking directions are in beta.'],
    });
  });
});
