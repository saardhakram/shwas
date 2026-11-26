/**
 * Service orchestration for `/api/ask` (rate limiting, Gemini invocation, deterministic mini-card).
 */

import { GEMINI_ASK_BUDGET_MS } from '../../../shared/constants.js';
import { callGeminiWithRetry } from '../geminiClient.js';
import { serverLogger } from '../logger.js';
import { InMemoryRateLimiter, type RateLimiter } from '../rateLimiter.js';
import { getErrorMessage } from '../types.js';
import {
  buildAskPrompt,
  buildEmptyQuestionResponse,
  getFriendlyFallbackMessage,
  getRateLimitMessage,
} from './prompt.js';
import {
  buildTimeMiniCard,
  DAILY_QUESTION_LIMIT,
  parseGeminiAskReply,
  type AskRequestBody,
  type AskResponseBody,
} from './schema.js';

const defaultRateLimiter = new InMemoryRateLimiter();

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveAskContextMetrics(body: AskRequestBody) {
  const forecast = Array.isArray(body.forecast) ? body.forecast.slice(0, 24) : [];
  const plan = Array.isArray(body.plan) ? body.plan.slice(0, 8) : [];
  const currentPm25 =
    typeof body.currentPm25 === 'number' ? body.currentPm25 : (forecast[0]?.pm25 ?? 150);
  const currentAqi =
    typeof body.currentAqi === 'number' ? body.currentAqi : (forecast[0]?.usAqi ?? 180);
  return { forecast, plan, currentPm25, currentAqi };
}

export async function processAskRequest(
  body: AskRequestBody,
  apiKey?: string,
  clientId?: string,
  deps?: { rateLimiter?: RateLimiter },
): Promise<AskResponseBody> {
  const question = (body.question || '').trim();
  const profile = body.profile;
  const language = profile?.language || 'en';

  if (!question) {
    return buildEmptyQuestionResponse(language);
  }

  const limiter = deps?.rateLimiter ?? defaultRateLimiter;
  const userKey = (body.userId || profile?.id || clientId || 'anonymous').trim();
  const rate = limiter.consume(`${userKey}_${getTodayDateKey()}`, DAILY_QUESTION_LIMIT);
  if (!rate.allowed) {
    return {
      answer: getRateLimitMessage(language),
      source: 'rate_limited',
      remainingToday: 0,
      limit: DAILY_QUESTION_LIMIT,
      error: 'daily_limit_reached',
    };
  }

  if (!apiKey) {
    return {
      answer: getFriendlyFallbackMessage(language),
      source: 'offline',
      miniCard: null,
      remainingToday: rate.remaining,
      limit: DAILY_QUESTION_LIMIT,
      error: 'missing_api_key',
    };
  }

  const { forecast, plan, currentPm25, currentAqi } = resolveAskContextMetrics(body);

  try {
    const prompt = buildAskPrompt(
      question,
      language,
      profile,
      currentPm25,
      currentAqi,
      forecast,
      plan,
      body.history,
    );
    const geminiRes = await callGeminiWithRetry({
      apiKey,
      prompt,
      temperature: 0.3,
      maxOutputTokens: 500,
      thinkingLevel: 'minimal',
      responseMimeType: 'application/json',
      maxServerBudgetMs: GEMINI_ASK_BUDGET_MS,
    });

    const parsed = parseGeminiAskReply(geminiRes.text, question);
    const miniCard = buildTimeMiniCard(
      parsed.targetHour,
      parsed.timeMentioned,
      parsed.durationHours,
      forecast,
      currentPm25,
      currentAqi,
    );

    return {
      answer: parsed.answerText,
      source: 'gemini',
      miniCard,
      remainingToday: rate.remaining,
      limit: DAILY_QUESTION_LIMIT,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    serverLogger.warn('[api/ask] Gemini request failed:', message);
    return {
      answer: getFriendlyFallbackMessage(language),
      source: 'offline',
      miniCard: null,
      remainingToday: rate.remaining,
      limit: DAILY_QUESTION_LIMIT,
      error: message || 'gemini_failed',
    };
  }
}
