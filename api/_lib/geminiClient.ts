/**
 * Shared Gemini client with resilient retry logic, fallback model switching, and request timeouts.
 *
 * Rules:
 * - Free tier is 5 requests/minute per model.
 * - On HTTP 429 (quota exhausted): do NOT retry the same model — go straight to fallback model.
 * - On HTTP 503 (service overloaded): retry once after 2s, then switch to fallback model.
 * - Max 3 Gemini calls per request total.
 * - Hard total server budget of 20 seconds (configurable per route).
 */

import type { GeminiAttemptFailure } from './types.js';
import { GeminiError } from './errors.js';
import { serverLogger } from './logger.js';
import {
  callGeminiOnce,
  type GeminiCallOptions,
  type GeminiCallResult,
} from './geminiTransport.js';
import {
  GEMINI_DEFAULT_BUDGET_MS,
  GEMINI_DEFAULT_FALLBACK_MODEL,
  GEMINI_DEFAULT_PRIMARY_MODEL,
} from '../../shared/constants.js';

export type { GeminiCallOptions, GeminiCallResult };

interface RetryContext {
  options: GeminiCallOptions;
  primaryModel: string;
  fallbackReserveMs: number;
  primaryCallCapMs: number;
  getRemainingBudget: () => number;
  attemptFailures: GeminiAttemptFailure[];
  totalCalls: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryPrimaryWithOptionalRetry(ctx: RetryContext): Promise<GeminiCallResult | null> {
  const firstBudget = Math.min(
    ctx.primaryCallCapMs,
    Math.max(2000, ctx.getRemainingBudget() - ctx.fallbackReserveMs),
  );
  ctx.totalCalls++;
  const firstRes = await callGeminiOnce(ctx.primaryModel, ctx.options, firstBudget);
  if (firstRes.ok && firstRes.text) {
    return { text: firstRes.text, modelUsed: ctx.primaryModel, attempts: ctx.totalCalls };
  }

  ctx.attemptFailures.push({
    model: ctx.primaryModel,
    status: firstRes.status,
    error: (firstRes.error || '').slice(0, 200),
  });
  serverLogger.warn(
    `[GeminiClient] Primary model ${ctx.primaryModel} failed (status: ${firstRes.status}). Error: ${firstRes.error}`,
  );

  const canRetry503 = firstRes.status === 503 && ctx.totalCalls < 3;
  if (!canRetry503 || ctx.getRemainingBudget() - 2000 <= 2500) {
    return null;
  }

  serverLogger.warn(
    `[GeminiClient] HTTP 503 on ${ctx.primaryModel}. Waiting 2s before single retry...`,
  );
  await delay(2000);
  if (ctx.getRemainingBudget() <= 1500) return null;

  ctx.totalCalls++;
  const retryBudget = Math.min(
    ctx.primaryCallCapMs,
    Math.max(2000, ctx.getRemainingBudget() - ctx.fallbackReserveMs),
  );
  const retryRes = await callGeminiOnce(ctx.primaryModel, ctx.options, retryBudget);
  if (retryRes.ok && retryRes.text) {
    return { text: retryRes.text, modelUsed: ctx.primaryModel, attempts: ctx.totalCalls };
  }

  ctx.attemptFailures.push({
    model: ctx.primaryModel,
    status: retryRes.status,
    error: (retryRes.error || '').slice(0, 200),
  });
  serverLogger.warn(
    `[GeminiClient] Primary model ${ctx.primaryModel} retry failed (status: ${retryRes.status}).`,
  );
  return null;
}

async function tryFallbackModel(
  ctx: RetryContext,
  fallbackModel: string,
): Promise<GeminiCallResult | null> {
  if (ctx.totalCalls >= 3 || ctx.getRemainingBudget() <= 1500) return null;

  serverLogger.warn(`[GeminiClient] Switching to fallback model: ${fallbackModel}`);
  ctx.totalCalls++;
  const fallbackRes = await callGeminiOnce(fallbackModel, ctx.options, ctx.getRemainingBudget());
  if (fallbackRes.ok && fallbackRes.text) {
    return { text: fallbackRes.text, modelUsed: fallbackModel, attempts: ctx.totalCalls };
  }

  ctx.attemptFailures.push({
    model: fallbackModel,
    status: fallbackRes.status,
    error: (fallbackRes.error || '').slice(0, 200),
  });
  serverLogger.warn(
    `[GeminiClient] Fallback model ${fallbackModel} failed (status: ${fallbackRes.status}). Error: ${fallbackRes.error}`,
  );
  return null;
}

/**
 * Executes Gemini calls adhering strictly to rate-limit and overload rules:
 * - On 429: jump straight to fallback model (no retry on same model)
 * - On 503: retry once after 2s, then jump to fallback model
 * - Hard limit of max 3 calls total
 */
export async function callGeminiWithRetry(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const primaryModel =
    options.primaryModel || process.env.GEMINI_MODEL || GEMINI_DEFAULT_PRIMARY_MODEL;
  const fallbackModel =
    options.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || GEMINI_DEFAULT_FALLBACK_MODEL;

  const startTime = Date.now();
  const totalBudgetMs = options.maxServerBudgetMs ?? GEMINI_DEFAULT_BUDGET_MS;
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
  throw new GeminiError(
    `All Gemini attempts failed after ${ctx.totalCalls} calls within ${Date.now() - startTime}ms${summary ? ` [${summary}]` : ''}.`,
    ctx.attemptFailures,
  );
}
