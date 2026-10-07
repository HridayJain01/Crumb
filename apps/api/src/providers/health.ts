import { addDays, dateRange, type DateKey } from '@crumb/core';

/*
 * Health data behind one interface (PRD §22): Google Health API today, other providers later.
 * The Google Health API (health.googleapis.com/v4) replaced the legacy Fitbit Web API, which
 * shuts down on Oct 30, 2026. Its scopes are "restricted": unverified apps are limited to
 * 100 manually-added test users, which is fine for a hackathon.
 */

export interface HealthDailyPoint {
  date: DateKey;
  steps?: number;
  /** Net active energy (excludes basal) as reported by the device. */
  activeKcal?: number;
  distanceKm?: number;
}

export interface HealthProvider {
  readonly id: 'google_health';
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<{ refreshToken: string }>;
  daily(refreshToken: string, from: DateKey, to: DateKey): Promise<HealthDailyPoint[]>;
  revoke(refreshToken: string): Promise<void>;
}

export const GOOGLE_HEALTH_SCOPE =
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://health.googleapis.com/v4/users/me/dataTypes';

type Json = Record<string, unknown>;

function civil(key: DateKey) {
  const [year, month, day] = key.split('-').map(Number);
  return { date: { year, month, day } };
}

function pad(n: unknown): string {
  return String(n).padStart(2, '0');
}

/** Date of a rollup point, tolerant to the field naming of the v4 response. */
export function pointDate(point: Json): DateKey | null {
  const candidates = [
    (point.civilStartTime as Json | undefined)?.date,
    ((point.interval as Json | undefined)?.civilStartTime as Json | undefined)?.date,
    ((point.civilInterval as Json | undefined)?.start as Json | undefined)?.date,
    point.date,
  ] as (Json | undefined)[];
  for (const c of candidates) {
    if (c && typeof c === 'object' && c.year) return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
  }
  const iso = (point.startTime ?? (point.interval as Json | undefined)?.startTime) as unknown;
  return typeof iso === 'string' ? iso.slice(0, 10) : null;
}

/** First numeric value under a key matching one of the hints (depth-first). */
export function pointValue(point: unknown, hints: RegExp): { key: string; value: number } | null {
  if (!point || typeof point !== 'object') return null;
  for (const [key, v] of Object.entries(point as Json)) {
    if (hints.test(key)) {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n === 'number' && Number.isFinite(n)) return { key, value: n };
    }
  }
  for (const v of Object.values(point as Json)) {
    if (v && typeof v === 'object') {
      const found = pointValue(v, hints);
      if (found) return found;
    }
  }
  return null;
}

export function createGoogleHealthProvider(cfg: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): HealthProvider {
  const f = cfg.fetchImpl ?? fetch;

  async function token(params: Record<string, string>): Promise<Json> {
    const res = await f(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        ...params,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token endpoint ${res.status}`);
    return (await res.json()) as Json;
  }

  async function rollup(
    access: string,
    dataType: string,
    from: DateKey,
    to: DateKey,
  ): Promise<Json[]> {
    const days = dateRange(from, to).length;
    const res = await f(`${API}/${dataType}/dataPoints:dailyRollUp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      // Closed-open civil date range aligned to whole days (max 90 days for these types).
      body: JSON.stringify({
        range: { start: civil(from), end: civil(addDays(to, 1)) },
        windowSizeDays: 1,
        pageSize: days,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`dailyRollUp ${dataType} ${res.status}`);
    const body = (await res.json()) as Json;
    return (body.rollupDataPoints as Json[] | undefined) ?? [];
  }

  return {
    id: 'google_health',
    authUrl(state) {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: GOOGLE_HEALTH_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      });
      return `${AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code) {
      const body = await token({
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirectUri,
      });
      if (typeof body.refresh_token !== 'string') throw new Error('No refresh token returned');
      return { refreshToken: body.refresh_token };
    },
    async daily(refreshToken, from, to) {
      const { access_token } = await token({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      if (typeof access_token !== 'string') throw new Error('No access token');
      const [steps, energy, distance] = await Promise.all([
        rollup(access_token, 'steps', from, to),
        rollup(access_token, 'active-energy-burned', from, to),
        rollup(access_token, 'distance', from, to).catch(() => [] as Json[]),
      ]);
      const byDate = new Map<DateKey, HealthDailyPoint>();
      const at = (d: DateKey) => byDate.get(d) ?? byDate.set(d, { date: d }).get(d)!;
      for (const p of steps) {
        const d = pointDate(p);
        const v = pointValue(p, /count|steps|sum|value/i);
        if (d && v) at(d).steps = Math.round(v.value);
      }
      for (const p of energy) {
        const d = pointDate(p);
        const v = pointValue(p, /kcal|calor|energy|sum|value/i);
        if (d && v) at(d).activeKcal = Math.round(v.value);
      }
      for (const p of distance) {
        const d = pointDate(p);
        const v = pointValue(p, /millimet|met(er|re)s?|sum|value/i);
        if (d && v) at(d).distanceKm = /millimet/i.test(v.key) ? v.value / 1e6 : v.value / 1000;
      }
      return [...byDate.values()].filter((p) => p.date >= from && p.date <= to);
    },
    async revoke(refreshToken) {
      await f(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' }).catch(
        () => undefined,
      );
    },
  };
}

/** Deterministic provider for MOCK_EXTERNALS demos and tests (clearly synthetic). */
export function createMockHealthProvider(): HealthProvider {
  return {
    id: 'google_health',
    authUrl: (state) =>
      `/api/integrations/google-health/callback?code=mock-code&state=${encodeURIComponent(state)}`,
    exchangeCode: async () => ({ refreshToken: 'mock-refresh-token' }),
    async daily(_token, from, to) {
      return dateRange(from, to).map((date, i) => ({
        date,
        steps: 5200 + ((i * 1733) % 4200),
        activeKcal: 180 + ((i * 47) % 160),
        distanceKm: Math.round((3.8 + ((i * 0.7) % 3)) * 10) / 10,
      }));
    },
    revoke: async () => undefined,
  };
}
