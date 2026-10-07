import type { AiClient } from './ai/types';
import type { TokenVerifier } from './auth';
import type { Env } from './env';
import type { Logger } from './log';
import type { HealthProvider } from './providers/health';
import type { RoutesClient } from './providers/routes';
import type { ServerStore } from './store';

/** Everything the HTTP layer needs, injected so tests can swap any external service. */
export interface Deps {
  env: Env;
  auth: TokenVerifier;
  store: ServerStore;
  ai: AiClient;
  routes: RoutesClient;
  health: HealthProvider | null;
  log: Logger;
  now: () => Date;
}

export type AppEnv = { Variables: { uid: string } };
