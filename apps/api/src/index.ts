import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadEnv } from './env';
import { createDeps } from './server';

// Local development convenience: read apps/api/.env if present (never used on Cloud Run).
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* no .env file */
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
