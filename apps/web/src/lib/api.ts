import {
  HealthSyncResponseSchema,
  InsightResponseSchema,
  InterpretActivityResponseSchema,
  InterpretMealResponseSchema,
  WalkRoutesResponseSchema,
  type HealthSyncRequest,
  type InsightRequest,
  type InterpretActivityRequest,
  type InterpretMealRequest,
  type WalkRoutesRequest,
} from '@crumb/core';
import type { ZodType } from 'zod';
import { auth } from './firebase';

/** Typed failure from the API (or the network). `code` is stable and drives fallbacks. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** True when the client should fall back to on-device logic. */
  get aiFallback(): boolean {
    return ['ai_unavailable', 'ai_quota', 'rate_limited', 'network', 'timeout'].includes(this.code);
  }
}

async function request<T>(
  method: string,
  path: string,
  schema: ZodType<T> | null,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<T> {
  if (!navigator.onLine) throw new ApiError(0, 'network', 'You’re offline.');
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'unauthenticated', 'Please sign in again.');
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === 'TimeoutError';
    throw new ApiError(
      0,
      timeout ? 'timeout' : 'network',
      timeout ? 'That took too long.' : 'Network problem.',
    );
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `Request failed (${res.status})`,
    );
  }
  if (!schema) return json as T;
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new ApiError(502, 'bad_response', 'Unexpected response from the server.');
  return parsed.data;
}

export const api = {
  interpretMeal: (body: InterpretMealRequest) =>
    request('POST', '/meals/interpret', InterpretMealResponseSchema, body, 45_000),
  interpretActivity: (body: InterpretActivityRequest) =>
    request('POST', '/activity/interpret', InterpretActivityResponseSchema, body),
  insight: (body: InsightRequest) => request('POST', '/insights', InsightResponseSchema, body),
  walkRoutes: (body: WalkRoutesRequest) =>
    request('POST', '/walk/routes', WalkRoutesResponseSchema, body),
  googleHealthStart: () =>
    request<{ authUrl: string }>('GET', '/integrations/google-health/start', null),
  googleHealthSync: (body: HealthSyncRequest) =>
    request('POST', '/integrations/google-health/sync', HealthSyncResponseSchema, body, 45_000),
  googleHealthDisconnect: () => request<void>('DELETE', '/integrations/google-health', null),
  deleteAccount: () => request<void>('DELETE', '/account', null),
};
