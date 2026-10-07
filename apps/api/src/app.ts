import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import {
  HealthSyncRequestSchema,
  InsightRequestSchema,
  InterpretActivityRequestSchema,
  InterpretMealRequestSchema,
  WalkRoutesRequestSchema,
  sanitizeActivityInterpretation,
  sanitizeInsight,
  sanitizeMealInterpretation,
  type InsightResponse,
  type InterpretActivityResponse,
  type InterpretMealResponse,
} from '@crumb/core';
import { AiUnavailableError } from './ai/types';
import type { AppEnv, Deps } from './deps';
import { AppError, Errors } from './errors';
import { uidRef } from './log';
import { fallbackInsight } from './insight-fallback';
import { planWalkRoutes } from './walk';
import { integrationRoutes, oauthCallbackRoute, revokeQuietly } from './integrations';

function validate<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      throw Errors.badRequest(
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : undefined,
      );
    }
  });
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function createApp(deps: Deps) {
  const { env, log } = deps;

  async function consume(c: Context<AppEnv>, bucket: 'ai' | 'routes'): Promise<boolean> {
    const uid = c.get('uid');
    const day = utcDay(deps.now());
    const userLimit = bucket === 'ai' ? env.AI_USER_DAILY_LIMIT : env.ROUTES_USER_DAILY_LIMIT;
    if (!(await deps.store.consume(`${uid}_${day}_${bucket}`, userLimit))) return false;
    if (
      bucket === 'ai' &&
      !(await deps.store.consume(`global_${day}_ai`, env.AI_GLOBAL_DAILY_LIMIT))
    ) {
      return false;
    }
    return true;
  }

  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    log.log('INFO', 'request', {
      route: c.req.routePath,
      method: c.req.method,
      status: c.res.status,
      latencyMs: Date.now() - started,
    });
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    log.log('ERROR', 'unhandled', { errorName: err.name, route: c.req.routePath });
    return c.json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found.' } }, 404));

  app.get('/health', (c) =>
    c.json({
      ok: true,
      ai: deps.ai.provider,
      routes: deps.routes.measured ? 'measured' : 'estimated',
    }),
  );

  // OAuth redirect target: no ID token on a browser redirect, so it is bound by a signed state.
  app.route('/', oauthCallbackRoute(deps));

  const authed = new Hono<AppEnv>();
  authed.use('*', async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw Errors.unauthenticated();
    try {
      const { uid } = await deps.auth.verify(token);
      c.set('uid', uid);
    } catch {
      throw Errors.unauthenticated();
    }
    await next();
  });
  authed.use(
    '*',
    bodyLimit({
      maxSize: 3 * 1024 * 1024,
      onError: (c) =>
        c.json({ error: { code: 'payload_too_large', message: 'That photo is too large.' } }, 413),
    }),
  );

  authed.post('/meals/interpret', validate(InterpretMealRequestSchema), async (c) => {
    const body = c.req.valid('json');
    if (!(await consume(c, 'ai'))) throw Errors.rateLimited();
    try {
      const result = await deps.ai.interpretMeal({
        text: body.text || undefined,
        image: body.imageBase64
          ? { base64: body.imageBase64, mimeType: body.imageMimeType ?? 'image/jpeg' }
          : undefined,
        localTime: body.localTime,
        timezone: body.timezone,
        diet: body.diet,
        mealTypeHint: body.mealTypeHint,
        memoryHints: body.memoryHints,
      });
      const { value, dropped } = sanitizeMealInterpretation(result.value);
      log.log('INFO', 'meal.interpreted', {
        user: uidRef(c.get('uid')),
        model: result.model,
        latencyMs: result.latencyMs,
        items: value.meals.reduce((n, m) => n + m.items.length, 0),
        dropped,
        status: value.status,
        withPhoto: Boolean(body.imageBase64),
      });
      const response: InterpretMealResponse = {
        interpretation: value,
        model: result.model,
        latencyMs: result.latencyMs,
      };
      return c.json(response);
    } catch (err) {
      if (err instanceof AiUnavailableError)
        throw err.quota ? Errors.aiQuota() : Errors.aiUnavailable();
      throw err;
    }
  });

  authed.post('/activity/interpret', validate(InterpretActivityRequestSchema), async (c) => {
    const body = c.req.valid('json');
    if (!(await consume(c, 'ai'))) throw Errors.rateLimited();
    try {
      const result = await deps.ai.interpretActivity(body.text);
      const response: InterpretActivityResponse = {
        interpretation: sanitizeActivityInterpretation(result.value),
        model: result.model,
      };
      return c.json(response);
    } catch (err) {
      if (err instanceof AiUnavailableError)
        throw err.quota ? Errors.aiQuota() : Errors.aiUnavailable();
      throw err;
    }
  });

  // Insights never fail: when AI is unavailable or capped, a deterministic template is returned.
  authed.post('/insights', validate(InsightRequestSchema), async (c) => {
    const body = c.req.valid('json');
    let response: InsightResponse = { ...fallbackInsight(body.context), source: 'template' };
    if (await consume(c, 'ai')) {
      try {
        const result = await deps.ai.wordInsight(body.kind, body.context);
        const worded = sanitizeInsight(result.value);
        if (worded) response = { ...worded, source: 'ai' };
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
      }
    }
    return c.json(response);
  });

  authed.post('/walk/routes', validate(WalkRoutesRequestSchema), async (c) => {
    const body = c.req.valid('json');
    if (!(await consume(c, 'routes'))) throw Errors.rateLimited();
    return c.json(await planWalkRoutes(body, deps));
  });

  authed.route('/integrations', integrationRoutes(deps, HealthSyncRequestSchema));

  authed.delete('/account', async (c) => {
    const uid = c.get('uid');
    await revokeQuietly(deps, uid);
    await deps.store.deleteUserData(uid);
    await deps.auth.deleteUser(uid);
    log.log('INFO', 'account.deleted', { user: uidRef(uid) });
    return c.body(null, 204);
  });

  app.route('/', authed);
  return app;
}

export type App = ReturnType<typeof createApp>;
