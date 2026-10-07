import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Error with a stable machine-readable code and an HTTP status. Messages are user-safe. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthenticated: () => new AppError(401, 'unauthenticated', 'Please sign in again.'),
  forbidden: () => new AppError(403, 'forbidden', 'Not allowed.'),
  badRequest: (message = 'Invalid request.') => new AppError(400, 'bad_request', message),
  rateLimited: () =>
    new AppError(429, 'rate_limited', 'Daily limit reached — manual logging still works.'),
  aiQuota: () =>
    new AppError(
      429,
      'ai_quota',
      'The AI is busy right now. Your entry can be logged with basic matching.',
    ),
  aiUnavailable: () =>
    new AppError(
      503,
      'ai_unavailable',
      'The AI is taking a break. Your entry can be logged with basic matching.',
    ),
  notConfigured: (what: string) =>
    new AppError(501, 'not_configured', `${what} is not configured on this server.`),
  upstream: (what: string) =>
    new AppError(502, 'upstream_error', `${what} did not respond as expected.`),
  notFound: () => new AppError(404, 'not_found', 'Not found.'),
};
