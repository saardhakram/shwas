/**
 * Shared Gemini client with resilient retry logic, fallback model switching, and request timeouts.
 *
 * Rules:
 * - Free tier is 5 requests/minute per model.
 * - On HTTP 429 (quota exhausted): do NOT retry the same model — go straight to fallback model.
 * - On HTTP 503 (service overloaded): retry once after 2s, then switch to fallback model.
 * - Max 3 Gemini calls per request total.
 * - Hard total server budget of 20 seconds (configurable per route).
 * - Default primary model: "gemini-3.5-flash" (or process.env.GEMINI_MODEL)
 * - Default fallback model: "gemini-3.1-flash-lite" (or process.env.GEMINI_FALLBACK_MODEL)
 */

import type {
  GeminiAttemptFailure,
  GeminiClientError,
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
  GeminiGenerationConfig,
  GeminiRequestPart,
} from './types.js';
import { getErrorMessage } from './types.js';

export interface GeminiCallOptions {
  apiKey: string;
  primaryModel?: string;
  fallbackModel?: string;
  prompt: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  responseMimeType?: string;
  maxServerBudgetMs?: number;
}

export interface GeminiCallResult {
  text: string;
  modelUsed: string;
  attempts: number;
}

interface SingleCallResult {
  ok: boolean;
  status: number;
  text?: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGeminiPayload(
  model: string,
  options: GeminiCallOptions,
): GeminiGenerateContentRequest {
  const parts: GeminiRequestPart[] = [{ text: options.prompt }];
  if (options.inlineData) {
    parts.push({
      inlineData: {
        mimeType: options.inlineData.mimeType,
        data: options.inlineData.data,
      },
    });
  }

  const generationConfig: GeminiGenerationConfig = {
    temperature: options.temperature ?? 0.2,
    responseMimeType: options.responseMimeType ?? 'application/json',
  };

  if (typeof options.maxOutputTokens === 'number' && options.maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = options.maxOutputTokens;
  }

  if (/^gemini-3/i.test(model)) {
    const isFlashOrLite = /flash|lite/i.test(model);
    generationConfig.thinkingConfig = {
      thinkingLevel: options.thinkingLevel ?? (isFlashOrLite ? 'minimal' : 'low'),
    };
  }

  return { contents: [{ parts }], generationConfig };
}

function extractCandidateText(json: GeminiGenerateContentResponse): string | undefined {
  const responseParts = json?.candidates?.[0]?.content?.parts || [];
  const textPart =
    responseParts.find((p) => !p?.thought && typeof p?.text === 'string' && p.text.trim()) ||
    responseParts.find((p) => typeof p?.text === 'string');
  return textPart?.text;
}

async function executeSingleCall(
  model: string,
  options: GeminiCallOptions,
  remainingBudgetMs: number,
  perCallCapMs: number,
): Promise<SingleCallResult> {
  const timeoutMs = Math.max(1000, Math.min(remainingBudgetMs, perCallCapMs));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(buildGeminiPayload(model, options)),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: errBody };
    }

    const json = (await res.json()) as GeminiGenerateContentResponse;
    const candidateText = extractCandidateText(json);
    if (!candidateText) {
      return { ok: false, status: 200, error: 'Empty candidate text in Gemini response' };
    }

    return { ok: true, status: 200, text: candidateText };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errName = err instanceof Error ? err.name : '';
    const errMsg = getErrorMessage(err);
    const isTimeout = errName === 'AbortError' || errMsg.includes('aborted');
    return {
      ok: false,
      status: isTimeout ? 408 : 500,
      error: isTimeout ? `Call timed out after ${timeoutMs}ms` : errMsg || 'Network error',
    };
  }
}

interface RetryContext {
  options: GeminiCallOptions;
  primaryModel: string;
  fallbackReserveMs: number;
  primaryCallCapMs: number;
  getRemainingBudget: () => number;
  attemptFailures: GeminiAttemptFailure[];
  totalCalls: number;
}

async function tryPrimaryWithOptionalRetry(ctx: RetryContext): Promise<GeminiCallResult | null> {
  if (ctx.getRemainingBudget() <= 1000 || ctx.totalCalls >= 3) return null;

  ctx.totalCalls++;
  const call1Budget =
    ctx.fallbackReserveMs > 0
      ? Math.max(2000, ctx.getRemainingBudget() - ctx.fallbackReserveMs)
      : ctx.getRemainingBudget();
  const res1 = await executeSingleCall(
    ctx.primaryModel,
    ctx.options,
    call1Budget,
    ctx.primaryCallCapMs,
  );

  if (res1.ok && res1.text) {
    return { text: res1.text, modelUsed: ctx.primaryModel, attempts: ctx.totalCalls };
  }

  ctx.attemptFailures.push({
    model: ctx.primaryModel,
    status: res1.status,
    error: (res1.error || '').slice(0, 200),
  });
  console.warn(
    `[GeminiClient] Call 1 to ${ctx.primaryModel} failed (status: ${res1.status}). Error: ${res1.error}`,
  );

  const budgetForRetry = ctx.getRemainingBudget() - ctx.fallbackReserveMs - 2000;
  if (res1.status !== 503 || budgetForRetry < 3000 || ctx.totalCalls >= 3) {
    return null;
  }

  await sleep(2000);
  ctx.totalCalls++;
  const retryCap = Math.min(
    ctx.primaryCallCapMs,
    Math.max(3000, ctx.getRemainingBudget() - ctx.fallbackReserveMs),
  );
  const res503 = await executeSingleCall(ctx.primaryModel, ctx.options, retryCap, retryCap);
  if (res503.ok && res503.text) {
    return { text: res503.text, modelUsed: ctx.primaryModel, attempts: ctx.totalCalls };
  }

  ctx.attemptFailures.push({
    model: ctx.primaryModel,
    status: res503.status,
    error: (res503.error || '').slice(0, 200),
  });
  console.warn(
    `[GeminiClient] Retry after 503 to ${ctx.primaryModel} failed (status: ${res503.status}). Error: ${res503.error}`,
  );
  return null;
}

async function tryFallbackModel(
  ctx: RetryContext,
  fallbackModel: string,
): Promise<GeminiCallResult | null> {
  if (ctx.getRemainingBudget() <= 1000 || ctx.totalCalls >= 3) return null;

  ctx.totalCalls++;
  console.warn(
    `[GeminiClient] Switching to fallback model: ${fallbackModel} (Call ${ctx.totalCalls})`,
  );
  const rem = ctx.getRemainingBudget();
  const fallbackRes = await executeSingleCall(fallbackModel, ctx.options, rem, rem);
  if (fallbackRes.ok && fallbackRes.text) {
    return { text: fallbackRes.text, modelUsed: fallbackModel, attempts: ctx.totalCalls };
  }

  ctx.attemptFailures.push({
    model: fallbackModel,
    status: fallbackRes.status,
    error: (fallbackRes.error || '').slice(0, 200),
  });
  console.warn(
    `[GeminiClient] Fallback model ${fallbackModel} failed (status: ${fallbackRes.status}). Error: ${fallbackRes.error}`,
  );
  return null;
}

/**
 * Executes Gemini calls adhering strictly to rate-limit and overload rules:
 * - On 429: jump straight to fallback model (no retry on same model)
 * - On 503: retry once after 2s, then jump to fallback model
 * - Hard limit of max 3 calls total
 * - Hard server budget (default 20s; configurable per route e.g. 35s for /api/ask)
 */
export async function callGeminiWithRetry(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const primaryModel = options.primaryModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fallbackModel =
    options.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';

  const startTime = Date.now();
  const totalBudgetMs = options.maxServerBudgetMs ?? 20000;
  const hasDistinctFallback = Boolean(fallbackModel && fallbackModel !== primaryModel);
  const fallbackReserveMs = hasDistinctFallback
    ? Math.min(10000, Math.floor(totalBudgetMs * 0.4))
    : 0;
  const primaryCallCapMs = hasDistinctFallback
    ? Math.max(5000, Math.min(12000, totalBudgetMs - fallbackReserveMs))
    : totalBudgetMs;

  const ctx: RetryContext = {
    options,
    primaryModel,
    fallbackReserveMs,
    primaryCallCapMs,
    getRemainingBudget: () => totalBudgetMs - (Date.now() - startTime),
    attemptFailures: [],
    totalCalls: 0,
  };

  const primaryHit = await tryPrimaryWithOptionalRetry(ctx);
  if (primaryHit) return primaryHit;

  if (hasDistinctFallback) {
    const fallbackHit = await tryFallbackModel(ctx, fallbackModel);
    if (fallbackHit) return fallbackHit;
  }

  const summary = ctx.attemptFailures.map((f) => `${f.model}: HTTP ${f.status}`).join('; ');
  const err: GeminiClientError = new Error(
    `All Gemini attempts failed after ${ctx.totalCalls} calls within ${Date.now() - startTime}ms${summary ? ` [${summary}]` : ''}.`,
  );
  err.attempts = ctx.attemptFailures;
  throw err;
}
