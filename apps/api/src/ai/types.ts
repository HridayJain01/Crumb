import type { Diet, InsightContext, MealType, MemoryHint } from '@crumb/core';

export interface AiResult {
  /** Raw JSON from the model — ALWAYS sanitized by the caller before use. */
  value: unknown;
  model: string;
  latencyMs: number;
}

export interface MealAiRequest {
  text?: string;
  image?: { base64: string; mimeType: string };
  localTime: string;
  timezone: string;
  diet?: Diet;
  mealTypeHint?: MealType;
  memoryHints: MemoryHint[];
}

export interface AiClient {
  readonly provider: 'vertex' | 'gemini-api' | 'mock';
  interpretMeal(req: MealAiRequest): Promise<AiResult>;
  interpretActivity(text: string): Promise<AiResult>;
  wordInsight(kind: 'daily' | 'weekly' | 'tomorrow', context: InsightContext): Promise<AiResult>;
}

/** Thrown when every model in the chain failed; `quota` if all failures were rate limits. */
export class AiUnavailableError extends Error {
  constructor(
    readonly quota: boolean,
    readonly causes: string[],
  ) {
    super(`AI unavailable (${quota ? 'quota' : 'error'}): ${causes.join('; ')}`);
    this.name = 'AiUnavailableError';
  }
}
