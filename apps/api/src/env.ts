import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Use fixture/rule-based providers instead of Gemini, Maps and Google Health. */
  MOCK_EXTERNALS: bool,
  /** Firebase / GCP project that owns Auth and Firestore. */
  FIREBASE_PROJECT_ID: z.string().min(1).default('demo-crumb'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),

  /** `vertex` in production (service-account auth, no key); `gemini-api` = AI Studio key for dev. */
  AI_PROVIDER: z.enum(['vertex', 'gemini-api', 'mock']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  VERTEX_PROJECT: z.string().optional(),
  VERTEX_LOCATION: z.string().default('global'),
  AI_MODEL_TEXT: z.string().default('gemini-3.5-flash-lite'),
  AI_MODEL_VISION: z.string().default('gemini-3.6-flash'),
  AI_FALLBACK_MODELS: z.string().default('gemini-3.5-flash'),
  /** `low` (default), `minimal`, `off` (omit thinking config), for latency vs. quality. */
  AI_THINKING: z.enum(['minimal', 'low', 'off']).default('low'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(2000).max(55000).default(20000),
  AI_USER_DAILY_LIMIT: z.coerce.number().int().min(1).default(60),
  AI_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).default(3000),
  ROUTES_USER_DAILY_LIMIT: z.coerce.number().int().min(1).default(20),

  /** Server key restricted to the Routes API. Optional: without it, loops are estimated. */
  MAPS_SERVER_KEY: z.string().optional(),

  GOOGLE_HEALTH_CLIENT_ID: z.string().optional(),
  GOOGLE_HEALTH_CLIENT_SECRET: z.string().optional(),
  /** Base64 32-byte key for AES-256-GCM encryption of refresh tokens at rest. */
  TOKEN_ENC_KEY: z.string().optional(),
  /** Secret for signing OAuth `state` values. */
  STATE_HMAC_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.MOCK_EXTERNALS) env.AI_PROVIDER = 'mock';
  if (env.AI_PROVIDER === 'gemini-api' && !env.GEMINI_API_KEY) {
    throw new Error('AI_PROVIDER=gemini-api requires GEMINI_API_KEY');
  }
  if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'gemini-api') {
    // Free-tier prompts may be used by Google to improve products — not for real users' data.
    console.warn(
      JSON.stringify({
        severity: 'WARNING',
        message: 'AI_PROVIDER=gemini-api in production; prefer vertex for user data',
      }),
    );
  }
  return env;
}

export function modelChain(env: Env, kind: 'text' | 'vision'): string[] {
  const primary = kind === 'vision' ? env.AI_MODEL_VISION : env.AI_MODEL_TEXT;
  const fallbacks = env.AI_FALLBACK_MODELS.split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}
