import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadEnv } from './env';
import { createDeps } from './server';

// Local development: apps/api/.env (your overrides) then .env.development (defaults).
// Existing variables are never overwritten, and neither file is used on Cloud Run.
if (process.env.NODE_ENV !== 'production') {
  for (const file of ['.env', '.env.development']) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* file not present */
    }
  }
}

const env = loadEnv();
const app = createApp(createDeps(env));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message: 'crumb-api listening',
      port: info.port,
      ai: env.AI_PROVIDER,
      mock: env.MOCK_EXTERNALS,
    }),
  );
});
