import { createHash } from 'node:crypto';

/*
 * Structured JSON logs (Cloud Logging parses them). Privacy rule: never log meal text,
 * images, coordinates or tokens — only ids, timings, models and error codes.
 */

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export interface Logger {
  log(severity: Severity, message: string, fields?: Record<string, unknown>): void;
}

const FORBIDDEN_KEYS = /text|image|base64|^lat$|^lng$|origin|waypoint|token|secret|email|password/i;

function scrub(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Pseudonymous user reference for logs. */
export function uidRef(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 12);
}

export const consoleLogger: Logger = {
  log(severity, message, fields) {
    const line = JSON.stringify({ severity, message, ...scrub(fields) });
    if (severity === 'ERROR') console.error(line);
    else console.log(line);
  },
};

export const silentLogger: Logger = { log() {} };
