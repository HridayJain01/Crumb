import { createApp } from '../src/app';
import { createMockAiClient } from '../src/ai/mock';
import type { AiClient } from '../src/ai/types';
import { createTestVerifier } from '../src/auth';
import type { Deps } from '../src/deps';
import { loadEnv } from '../src/env';
import { silentLogger } from '../src/log';
import { createMockHealthProvider, type HealthProvider } from '../src/providers/health';
import { createMockRoutesClient, type RoutesClient } from '../src/providers/routes';
import { createMemoryStore } from '../src/store';

export const TEST_KEYS = {
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  STATE_HMAC_KEY: 'test-state-secret',
};

export function makeTestApp(
  over: {
    env?: Record<string, string>;
    ai?: AiClient;
    routes?: RoutesClient;
    health?: HealthProvider | null;
    now?: () => Date;
  } = {},
) {
  const env = loadEnv({
    NODE_ENV: 'test',
    AI_PROVIDER: 'mock',
    PUBLIC_APP_URL: 'https://crumb.test',
    ...over.env,
  });
  const store = createMemoryStore();
  const auth = createTestVerifier();
  const deps: Deps = {
    env,
    auth,
    store,
    ai: over.ai ?? createMockAiClient(),
    routes: over.routes ?? createMockRoutesClient(),
    health: over.health === undefined ? createMockHealthProvider() : over.health,
    log: silentLogger,
    now: over.now ?? (() => new Date('2026-10-07T09:30:00Z')),
  };
  const app = createApp(deps);
  const call = (method: string, path: string, body?: unknown, uid: string | null = 'alice') =>
    app.request(path, {
      method,
      headers: {
        ...(uid ? { Authorization: `Bearer test:${uid}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  return { app, deps, store, auth, call };
}

/** Parsed JSON body for assertions (tests only). */
export const json = (res: Response) => res.json() as Promise<any>;

export const mealBody = (text: string) => ({
  text,
  localTime: '2026-10-07T13:20',
  timezone: 'Asia/Kolkata',
  memoryHints: [],
});
