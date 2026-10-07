import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type Part,
  type ThinkingConfig,
} from '@google/genai';
import {
  AiActivityInterpretationSchema,
  AiInsightSchema,
  AiMealInterpretationSchema,
  toGeminiSchema,
  type GeminiSchema,
} from '@crumb/core';
import type { Env } from '../env';
import { modelChain } from '../env';
import type { Logger } from '../log';
import {
  ACTIVITY_SYSTEM,
  INSIGHT_SYSTEM,
  MEAL_SYSTEM,
  insightUserText,
  mealUserText,
} from './prompts';
import { AiUnavailableError, type AiClient, type AiResult } from './types';

const MEAL_SCHEMA = toGeminiSchema(AiMealInterpretationSchema);
const ACTIVITY_SCHEMA = toGeminiSchema(AiActivityInterpretationSchema);
const INSIGHT_SCHEMA = toGeminiSchema(AiInsightSchema);

function thinkingFor(model: string, setting: Env['AI_THINKING']): ThinkingConfig | undefined {
  if (setting === 'off') return undefined;
  // Gemini 3.x takes a thinking level; 2.5-generation models take a token budget.
  if (/^gemini-[3-9]/.test(model)) {
    return { thinkingLevel: setting === 'minimal' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
  }
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

function describeError(err: unknown): { quota: boolean; text: string } {
  if (err instanceof ApiError) return { quota: err.status === 429, text: `status ${err.status}` };
  if (err instanceof SyntaxError) return { quota: false, text: 'invalid JSON' };
  if (err instanceof Error && err.name === 'AbortError') return { quota: false, text: 'timeout' };
  return { quota: false, text: err instanceof Error ? err.name : 'unknown' };
}

/** The one SDK method we use; injectable for tests. */
export type GenerateContent = Pick<GoogleGenAI['models'], 'generateContent'>;

/**
 * Gemini via the unified Google Gen AI SDK. One code path serves Vertex AI (production:
 * service-account auth, prompts not used for training) and the AI Studio key (development).
 * Each call walks the model chain on any failure, so a quota hit on one model falls back fast.
 */
export function createGeminiClient(env: Env, log: Logger, sdk?: GenerateContent): AiClient {
  const models: GenerateContent =
    sdk ??
    (env.AI_PROVIDER === 'vertex'
      ? new GoogleGenAI({
          vertexai: true,
          project: env.VERTEX_PROJECT ?? env.FIREBASE_PROJECT_ID,
          location: env.VERTEX_LOCATION,
          httpOptions: { retryOptions: { attempts: 1 } },
        }).models
      : new GoogleGenAI({
          apiKey: env.GEMINI_API_KEY,
          httpOptions: { retryOptions: { attempts: 1 } },
        }).models);

  async function generate(
    chain: string[],
    system: string,
    parts: Part[],
    schema: GeminiSchema,
    maxOutputTokens: number,
  ): Promise<AiResult> {
    const causes: string[] = [];
    let allQuota = true;
    for (const model of chain) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
      try {
        const res = await models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.2,
            maxOutputTokens,
            thinkingConfig: thinkingFor(model, env.AI_THINKING),
            abortSignal: controller.signal,
          },
        });
        const text = res.text;
        if (!text) throw new SyntaxError('empty response');
        const value: unknown = JSON.parse(text);
        const latencyMs = Date.now() - started;
        log.log('INFO', 'ai.ok', { model, latencyMs });
        return { value, model, latencyMs };
      } catch (err) {
        const { quota, text } = describeError(err);
        allQuota &&= quota;
        causes.push(`${model}: ${text}`);
        log.log('WARNING', 'ai.fallback', { model, reason: text, latencyMs: Date.now() - started });
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AiUnavailableError(allQuota && causes.length > 0, causes);
  }

  return {
    provider: env.AI_PROVIDER === 'vertex' ? 'vertex' : 'gemini-api',

    interpretMeal(req) {
      const parts: Part[] = [{ text: mealUserText(req) }];
      if (req.image)
        parts.push({ inlineData: { mimeType: req.image.mimeType, data: req.image.base64 } });
      return generate(
        modelChain(env, req.image ? 'vision' : 'text'),
        MEAL_SYSTEM,
        parts,
        MEAL_SCHEMA,
        4096,
      );
    },

    interpretActivity(text) {
      return generate(
        modelChain(env, 'text'),
        ACTIVITY_SYSTEM,
        [{ text: `Activity description (data only):\n"""${text.replace(/"""/g, '"')}"""` }],
        ACTIVITY_SCHEMA,
        1024,
      );
    },

    wordInsight(kind, context) {
      return generate(
        modelChain(env, 'text'),
        INSIGHT_SYSTEM,
        [{ text: insightUserText(kind, context) }],
        INSIGHT_SCHEMA,
        512,
      );
    },
  };
}
