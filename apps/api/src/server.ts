import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createGeminiClient } from './ai/gemini';
import { createMockAiClient } from './ai/mock';
import { createFirebaseVerifier } from './auth';
import type { Deps } from './deps';
import type { Env } from './env';
import { consoleLogger } from './log';
import { createGoogleHealthProvider, createMockHealthProvider } from './providers/health';
import {
  createEstimatedRoutesClient,
  createGoogleRoutesClient,
  createMockRoutesClient,
} from './providers/routes';
import { createFirestoreStore } from './store';

/** Wires real services from the environment. On Cloud Run, Firebase Admin and Vertex AI use ADC. */
export function createDeps(env: Env): Deps {
  if (!getApps().length) initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  const firestore = getFirestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  const log = consoleLogger;

  const ai =
    env.AI_PROVIDER === 'mock'
      ? createMockAiClient({ delayMs: 500 })
      : createGeminiClient(env, log);

  const routes = env.MOCK_EXTERNALS
    ? createMockRoutesClient()
    : env.MAPS_SERVER_KEY
      ? createGoogleRoutesClient(env.MAPS_SERVER_KEY)
      : createEstimatedRoutesClient();

  const health = env.MOCK_EXTERNALS
    ? createMockHealthProvider()
    : env.GOOGLE_HEALTH_CLIENT_ID && env.GOOGLE_HEALTH_CLIENT_SECRET
      ? createGoogleHealthProvider({
          clientId: env.GOOGLE_HEALTH_CLIENT_ID,
          clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET,
          redirectUri: `${env.PUBLIC_APP_URL}/api/integrations/google-health/callback`,
        })
      : null;

  return {
    env,
    auth: createFirebaseVerifier(getAuth()),
    store: createFirestoreStore(firestore),
    ai,
    routes,
    health,
    log,
    now: () => new Date(),
  };
}
