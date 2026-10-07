import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  addDays,
  daysBetween,
  type ActivityWithId,
  type HealthSyncRequestSchema,
  type HealthSyncResponse,
} from '@crumb/core';
import type { AppEnv, Deps } from './deps';
import { decryptSecret, encryptSecret, signState, verifyState } from './crypto';
import { AppError, Errors } from './errors';
import { uidRef } from './log';
import type { HealthDailyPoint } from './providers/health';

const PROVIDER = 'google_health';
const MAX_SYNC_DAYS = 31;

/** Best-effort token revocation: never lets a bad/rotated key block disconnecting or deleting. */
export async function revokeQuietly(deps: Deps, uid: string): Promise<void> {
  const { health, env } = deps;
  if (!health || !env.TOKEN_ENC_KEY) return;
  try {
    const sealed = await deps.store.getSealedToken(uid, PROVIDER);
    if (sealed) await health.revoke(decryptSecret(sealed, env.TOKEN_ENC_KEY));
  } catch {
    deps.log.log('WARNING', 'integration.revoke_failed', { user: uidRef(uid), provider: PROVIDER });
  }
}

function requireHealth(deps: Deps) {
  const { health, env } = deps;
  if (!health || !env.TOKEN_ENC_KEY || !env.STATE_HMAC_KEY)
    throw Errors.notConfigured('Google Health');
  return { health, encKey: env.TOKEN_ENC_KEY, stateKey: env.STATE_HMAC_KEY };
}

/** Converts a device day into the activity document the client's energy model understands. */
export function toActivity(p: HealthDailyPoint, nowIso: string): ActivityWithId {
  const id = `gh-steps-${p.date}`;
  const kcal = Math.max(0, Math.round(p.activeKcal ?? 0));
  return {
    id,
    date: p.date,
    startedAt: `${p.date}T00:00:00.000Z`,
    type: 'steps',
    label: 'Steps (Google Health)',
    steps: Math.max(0, Math.round(p.steps ?? 0)),
    distanceKm: p.distanceKm !== undefined ? Math.round(p.distanceKm * 100) / 100 : undefined,
    kcal,
    range: { low: Math.round(kcal * 0.8), high: Math.round(kcal * 1.2) },
    source: 'google_health',
    confidence: 'medium',
    externalId: id,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Browser redirect target after Google consent. Bound to the user by the signed `state`. */
export function oauthCallbackRoute(deps: Deps) {
  const app = new Hono<AppEnv>();
  app.get('/integrations/google-health/callback', async (c) => {
    const back = (status: string) =>
      c.redirect(
        `${deps.env.PUBLIC_APP_URL}/profile?integration=${PROVIDER}&status=${status}`,
        302,
      );
    const { health, encKey, stateKey } = requireHealth(deps);
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (c.req.query('error') || !code || !state) return back('cancelled');
    const uid = verifyState(state, stateKey, deps.now().getTime());
    if (!uid) return back('expired');
    try {
      const { refreshToken } = await health.exchangeCode(code);
      await deps.store.putSealedToken(uid, PROVIDER, encryptSecret(refreshToken, encKey));
      await deps.store.setIntegration(uid, PROVIDER, { connected: true });
      deps.log.log('INFO', 'integration.connected', { user: uidRef(uid), provider: PROVIDER });
      return back('connected');
    } catch {
      deps.log.log('WARNING', 'integration.connect_failed', {
        user: uidRef(uid),
        provider: PROVIDER,
      });
      return back('failed');
    }
  });
  return app;
}

export function integrationRoutes(deps: Deps, syncSchema: typeof HealthSyncRequestSchema) {
  const app = new Hono<AppEnv>();

  app.get('/google-health/start', (c) => {
    const { health, stateKey } = requireHealth(deps);
    const state = signState(c.get('uid'), stateKey, deps.now().getTime());
    return c.json({ authUrl: health.authUrl(state) });
  });

  app.post(
    '/google-health/sync',
    zValidator('json', syncSchema, (r) => {
      if (!r.success) throw Errors.badRequest('Invalid date range');
    }),
    async (c) => {
      const { health, encKey } = requireHealth(deps);
      const uid = c.get('uid');
      let { from } = c.req.valid('json');
      const { to } = c.req.valid('json');
      if (daysBetween(from, to) < 0) throw Errors.badRequest('from must be before to');
      if (daysBetween(from, to) >= MAX_SYNC_DAYS) from = addDays(to, -(MAX_SYNC_DAYS - 1));
      const sealed = await deps.store.getSealedToken(uid, PROVIDER);
      if (!sealed) throw new AppError(409, 'not_connected', 'Google Health is not connected.');
      let points: HealthDailyPoint[];
      try {
        points = await health.daily(decryptSecret(sealed, encKey), from, to);
      } catch {
        deps.log.log('WARNING', 'integration.sync_failed', {
          user: uidRef(uid),
          provider: PROVIDER,
        });
        throw Errors.upstream('Google Health');
      }
      const nowIso = deps.now().toISOString();
      const activities = points
        .filter((p) => p.steps || p.activeKcal)
        .map((p) => toActivity(p, nowIso));
      if (activities.length) await deps.store.upsertActivities(uid, activities);
      await deps.store.setIntegration(uid, PROVIDER, { connected: true, lastSyncAt: nowIso });
      const response: HealthSyncResponse = {
        changedDates: activities.map((a) => a.date),
        imported: activities.length,
      };
      return c.json(response);
    },
  );

  app.delete('/google-health', async (c) => {
    requireHealth(deps);
    const uid = c.get('uid');
    await revokeQuietly(deps, uid);
    await deps.store.deleteSealedToken(uid, PROVIDER);
    await deps.store.setIntegration(uid, PROVIDER, { connected: false });
    return c.body(null, 204);
  });

  return app;
}
