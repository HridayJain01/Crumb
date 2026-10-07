/**
 * Measures meal interpretation against labelled examples, end to end through the same
 * sanitize → estimate pipeline the app uses (model output is never trusted directly).
 *
 *   pnpm ai:eval                 real model, configured in apps/api/.env
 *                                (AI_PROVIDER=gemini-api + GEMINI_API_KEY, or AI_PROVIDER=vertex)
 *   pnpm ai:eval --mock          the rule-based stand-in (checks the harness, costs nothing)
 *   pnpm ai:eval --only roti-dal,idli-sambar --delay 4000
 *
 * Photos: put JPEGs in scripts/ai-eval/photos/ with a sibling <name>.json holding
 * {"expect":[{"food":"roti"}, ...]}; they run after the text cases.
 *
 * Reports item recall/precision, gram error and latency. Target: ≥ 90% item recall on text.
 * Use synthetic examples only with an AI Studio key — free-tier prompts may be used by Google.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildMealDrafts, sanitizeMealInterpretation, type FoodItem } from '@crumb/core';
import { getFoodDb } from '@crumb/core/foods';
import { createGeminiClient } from '../apps/api/src/ai/gemini';
import { createMockAiClient } from '../apps/api/src/ai/mock';
import type { AiClient } from '../apps/api/src/ai/types';
import { loadEnv } from '../apps/api/src/env';
import type { Logger } from '../apps/api/src/log';

interface Expectation {
  food?: string;
  any?: string[];
  grams?: number;
}
interface EvalCase {
  id: string;
  text?: string;
  image?: string;
  expect: Expectation[];
  status?: 'ok' | 'not_food';
  meals?: number;
}
interface Outcome {
  id: string;
  ok: boolean;
  recall: number;
  precision: number;
  gramErrors: number[];
  latencyMs: number;
  model: string;
  missing: string[];
  extra: string[];
  note?: string;
}

const { values: args } = parseArgs({
  options: {
    mock: { type: 'boolean', default: false },
    only: { type: 'string' },
    delay: { type: 'string', default: '1500' },
    strict: { type: 'boolean', default: false },
  },
});

const here = join(import.meta.dirname, 'ai-eval');
const silent: Logger = { log: () => undefined };

function client(): AiClient {
  if (args.mock) return createMockAiClient();
  if (existsSync('apps/api/.env')) process.loadEnvFile('apps/api/.env');
  const env = loadEnv({ ...process.env, MOCK_EXTERNALS: 'false' });
  if (env.AI_PROVIDER === 'mock') {
    console.error(
      'Configure a real model in apps/api/.env (AI_PROVIDER=gemini-api with GEMINI_API_KEY, or\n' +
        'AI_PROVIDER=vertex with VERTEX_PROJECT), or run with --mock.',
    );
    process.exit(1);
  }
  return createGeminiClient(env, silent);
}

function loadCases(): EvalCase[] {
  const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')) as EvalCase[];
  const photos = join(here, 'photos');
  if (existsSync(photos)) {
    for (const file of readdirSync(photos).filter((f) => /\.jpe?g$/i.test(f))) {
      const labels = join(photos, file.replace(/\.jpe?g$/i, '.json'));
      if (!existsSync(labels)) continue;
      const { expect } = JSON.parse(readFileSync(labels, 'utf8')) as { expect: Expectation[] };
      cases.push({ id: `photo:${file}`, image: join(photos, file), expect });
    }
  }
  const only = args.only?.split(',').map((s) => s.trim());
  return only ? cases.filter((c) => only.includes(c.id)) : cases;
}

const matches = (e: Expectation, item: FoodItem) =>
  item.foodId !== null && (e.food === item.foodId || Boolean(e.any?.includes(item.foodId)));
const label = (e: Expectation) => e.food ?? e.any?.join('|') ?? '?';

async function run(ai: AiClient, c: EvalCase): Promise<Outcome> {
  const started = Date.now();
  const result = await ai.interpretMeal({
    text: c.text,
    image: c.image
      ? { base64: readFileSync(c.image).toString('base64'), mimeType: 'image/jpeg' }
      : undefined,
    localTime: '2026-10-07T13:15',
    timezone: 'Asia/Kolkata',
    memoryHints: [],
  });
  const { value } = sanitizeMealInterpretation(result.value);
  const drafts = buildMealDrafts(value, {
    db: getFoodDb(),
    inputType: c.image ? 'photo' : 'text',
    memory: new Map(),
    templates: [],
    hour: 13,
  });
  const items = drafts.flatMap((d) => d.items);
  const base = { id: c.id, latencyMs: Date.now() - started, model: result.model };

  if (c.status === 'not_food') {
    const ok = value.status === 'not_food' || items.length === 0;
    return {
      ...base,
      ok,
      recall: 1,
      precision: ok ? 1 : 0,
      gramErrors: [],
      missing: [],
      extra: ok ? [] : items.map((i) => i.name),
    };
  }

  const used = new Set<number>();
  const missing: string[] = [];
  const gramErrors: number[] = [];
  for (const e of c.expect) {
    const index = items.findIndex((item, i) => !used.has(i) && matches(e, item));
    if (index === -1) {
      missing.push(label(e));
      continue;
    }
    used.add(index);
    if (e.grams) gramErrors.push(Math.abs(items[index]!.grams - e.grams) / e.grams);
  }
  const extra = items.filter((_, i) => !used.has(i)).map((i) => i.foodId ?? `?${i.name}`);
  const recall = c.expect.length ? (c.expect.length - missing.length) / c.expect.length : 1;
  const precision = items.length ? used.size / items.length : 1;
  const mealsOk = c.meals === undefined || drafts.length === c.meals;
  return {
    ...base,
    ok: missing.length === 0 && mealsOk,
    recall,
    precision,
    gramErrors,
    missing,
    extra,
    note: mealsOk ? undefined : `expected ${c.meals} meals, got ${drafts.length}`,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

async function main() {
  const ai = client();
  const cases = loadCases();
  const delay = Number(args.delay);
  const outcomes: Outcome[] = [];
  let failures = 0;
  console.log(`Evaluating ${cases.length} cases with ${args.mock ? 'the mock' : ai.provider}…\n`);
  for (const c of cases) {
    try {
      const o = await run(ai, c);
      outcomes.push(o);
      const detail = [
        o.missing.length ? `missing ${o.missing.join(', ')}` : '',
        o.extra.length ? `extra ${o.extra.join(', ')}` : '',
        o.note ?? '',
      ]
        .filter(Boolean)
        .join(' · ');
      console.log(
        `${o.ok ? '✓' : '✗'} ${c.id.padEnd(18)} ${String(o.latencyMs).padStart(5)} ms  ${detail}`,
      );
    } catch (err) {
      failures++;
      console.log(`! ${c.id.padEnd(18)} ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!args.mock && delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  const recall = outcomes.reduce((s, o) => s + o.recall, 0) / Math.max(1, outcomes.length);
  const precision = outcomes.reduce((s, o) => s + o.precision, 0) / Math.max(1, outcomes.length);
  const grams = outcomes.flatMap((o) => o.gramErrors);
  const latencies = outcomes.map((o) => o.latencyMs).sort((a, b) => a - b);
  const models = [...new Set(outcomes.map((o) => o.model))].join(', ');
  console.log(
    [
      '',
      `Cases passed      ${outcomes.filter((o) => o.ok).length}/${cases.length}${failures ? ` (${failures} errored)` : ''}`,
      `Item recall       ${pct(recall)}  (target ≥ 90%)`,
      `Item precision    ${pct(precision)}`,
      `Grams error       median ${pct(median(grams))} over ${grams.length} counted items`,
      `Latency           p50 ${median(latencies)} ms · p95 ${latencies[Math.floor(latencies.length * 0.95)] ?? 0} ms`,
      `Models            ${models || '—'}`,
    ].join('\n'),
  );
  if (args.strict && (recall < 0.9 || failures > 0)) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
