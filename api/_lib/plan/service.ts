/**
 * Service orchestration for `/api/plan` (caching, Gemini call, rule-based fallback).
 */

import { GEMINI_PLAN_BUDGET_MS } from '../../../shared/constants.js';
import type { ForecastDataPoint } from '../../../shared/forecastWindow.js';
import { generateRuleBasedPlan } from '../../../shared/planRules.js';
import type { RawPlanItem, UserProfile } from '../../../shared/types.js';
import { callGeminiWithRetry } from '../geminiClient.js';
import { serverLogger } from '../logger.js';
import { getErrorMessage } from '../types.js';
import { computePlanCacheKey, InMemoryPlanCache, type PlanCache } from './cache.js';
import {
  buildPlanPrompt,
  DEFAULT_PROFILE,
  formatAttemptDetails,
  parseValidatedPlanItems,
} from './prompt.js';

const defaultPlanCache = new InMemoryPlanCache();

export async function processPlanRequest(
  body: { profile?: UserProfile; forecast?: ForecastDataPoint[] },
  apiKey?: string,
  deps?: { cache?: PlanCache },
): Promise<{ plan: RawPlanItem[]; source: string; error?: string }> {
  const profile: UserProfile = body.profile || DEFAULT_PROFILE;
  const forecast: ForecastDataPoint[] = body.forecast || [];
  const cache = deps?.cache ?? defaultPlanCache;
  const cacheKey = computePlanCacheKey(profile, new Date().toISOString().slice(0, 10));

  const cached = cache.get(cacheKey);
  if (cached) {
    return { plan: cached.plan, source: cached.source };
  }

  if (!apiKey) {
    return { plan: generateRuleBasedPlan(profile, forecast), source: 'rule_based_no_key' };
  }

  try {
    const geminiResult = await callGeminiWithRetry({
      apiKey,
      prompt: buildPlanPrompt(profile, forecast),
      temperature: 0.25,
      maxOutputTokens: 900,
      thinkingLevel: 'minimal',
      responseMimeType: 'application/json',
      maxServerBudgetMs: GEMINI_PLAN_BUDGET_MS,
    });

    const validated = parseValidatedPlanItems(geminiResult.text);
    cache.set(cacheKey, { plan: validated, source: 'gemini', timestamp: Date.now() });
    return { plan: validated, source: 'gemini' };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    serverLogger.warn(
      `[api/plan] Gemini failure (${formatAttemptDetails(err)}) — falling back to rule-based plan. Error: ${message}`,
    );
    return {
      plan: generateRuleBasedPlan(profile, forecast),
      source: 'rule_based_fallback',
      error: message || 'gemini_failed',
    };
  }
}
