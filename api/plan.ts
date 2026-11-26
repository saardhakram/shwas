/**
 * Vercel Serverless Function: /api/plan
 *
 * Server-side only: reads process.env.GEMINI_API_KEY.
 * Generates 6 structured plan items via Gemini with strict JSON response;
 * validates output and returns a rule-based fallback on any failure.
 */

import { generateRuleBasedPlan } from '../src/shared/planRules.js';
import { GEMINI_PLAN_BUDGET_MS, PLAN_CACHE_TTL_MS } from '../src/shared/constants.js';
import type { UserProfile, RawPlanItem } from '../src/types/index.js';
import type { ForecastDataPoint } from '../src/shared/forecastWindow.js';
import { callGeminiWithRetry } from './_lib/geminiClient.js';
import { serverLogger } from './_lib/logger.js';
import type { ApiRequest, ApiResponse, GeminiClientError } from './_lib/types.js';
import { getErrorMessage, isRecord, parseRequestBody } from './_lib/types.js';
import { validatePlanRequestBody } from './_lib/validation.js';

interface CacheEntry {
  plan: RawPlanItem[];
  source: string;
  timestamp: number;
}

const PLAN_CACHE = new Map<string, CacheEntry>();

const DEFAULT_PROFILE: UserProfile = {
  language: 'en',
  location: { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
  family: [
    {
      id: 'me',
      name: 'Me',
      age: 32,
      flags: {},
      routine: { hoursOutside: 2, hoursAway: 8, awayPlace: 'office' },
    },
  ],
  home: {
    windowsFacingRoad: true,
    purifier: true,
    chimney: true,
    cookingFuel: 'lpg',
    commuteMode: 'metro',
  },
};

function computeCacheKey(profile: UserProfile, dateStr: string): string {
  const familyKey = (profile.family || [])
    .map((m) => `${m.id}_${m.age}_${m.routine?.hoursOutside || 0}_${m.routine?.hoursAway || 0}`)
    .sort()
    .join('|');
  const homeKey = `${profile.home?.windowsFacingRoad}_${profile.home?.purifier}_${profile.home?.chimney}_${profile.home?.cookingFuel}_${profile.home?.commuteMode}`;
  const locKey = profile.location?.name || `${profile.location?.lat}_${profile.location?.lon}`;
  const langKey = profile.language || 'en';
  return `plan_${dateStr}_${langKey}_${locKey}_${familyKey}_${homeKey}`;
}

export function clearPlanCacheForTesting(): void {
  PLAN_CACHE.clear();
}

function buildPlanPrompt(profile: UserProfile, forecast: ForecastDataPoint[]): string {
  const next24h = forecast.slice(0, 24);
  const sampledForecast =
    next24h.length > 8 ? next24h.filter((_, idx) => idx % 3 === 0).slice(0, 8) : next24h;
  const forecastSummary =
    sampledForecast.length > 0
      ? sampledForecast
          .map((p) => `${p.fullTime || p.time}(${p.day}):PM2.5=${p.pm25},AQI=${p.usAqi}`)
          .join(' | ')
      : 'Morning PM2.5=320 | Afternoon PM2.5=120 | Evening PM2.5=290';

  const familySummary = profile.family
    .map((f) => {
      const tags = [
        f.flags.asthma ? 'asthma' : '',
        f.flags.heart ? 'heart' : '',
        f.flags.pregnancy ? 'pregnant' : '',
      ]
        .filter(Boolean)
        .join(',');
      const tagPart = tags ? `,${tags}` : '';
      return `${f.name}(${f.age}${tagPart},${f.routine.hoursOutside}h out,${f.routine.hoursAway}h away)`;
    })
    .join('; ');

  return `You are Shwas, an Indian urban air quality assistant. Build a concise daily air plan of 6 items strictly in language "${profile.language}".

PROFILE: City=${profile.location.name} | RoadWindows=${profile.home.windowsFacingRoad} | Purifier=${profile.home.purifier} | Chimney=${profile.home.chimney} | Fuel=${profile.home.cookingFuel} | Commute=${profile.home.commuteMode}
FAMILY: ${familySummary}
NEXT 24H (3h steps): ${forecastSummary}

Return ONLY a JSON array of 6 items (no markdown):
[{"time":"7:30 AM","action":"short instruction in ${profile.language}","reason":"short reason in ${profile.language}","category":"seal|ventilate|commute|purify|routine","hours":3,"before_pm25":280,"after_pm25":140}]
Rules: hours > 0; before_pm25 > after_pm25; keep action <= 12 words and reason <= 14 words.`;
}

function parseValidatedPlanItems(rawText: string): RawPlanItem[] {
  const rawContent = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const parsed: unknown = JSON.parse(rawContent);
  const candidateList = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.plan)
      ? parsed.plan
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : [];

  if (!Array.isArray(candidateList) || candidateList.length < 5) {
    throw new Error(`Invalid item count: ${candidateList?.length}`);
  }

  return candidateList.map((rawItem, idx) => {
    const item = isRecord(rawItem) ? rawItem : {};
    const before = Number(item.before_pm25) || 200;
    const after = Number(item.after_pm25) || 100;
    const hours = typeof item.hours === 'number' && item.hours > 0 ? Number(item.hours) : 2;
    return {
      time: String(item.time || `${7 + idx * 2}:00 AM`),
      action: String(item.action || 'Clean air action'),
      reason: String(item.reason || 'Reduces particulate matter exposure.'),
      category: String(item.category || 'routine'),
      hours,
      before_pm25: Math.max(before, after + 20),
      after_pm25: Math.min(before - 20, after),
    };
  });
}

function formatAttemptDetails(err: unknown): string {
  const clientErr = err as GeminiClientError;
  if (!Array.isArray(clientErr?.attempts)) return 'no_attempt_details';
  return clientErr.attempts
    .map((a) => `${a.model} status=${a.status} (${String(a.error || '').slice(0, 120)})`)
    .join(' | ');
}

export async function processPlanRequest(
  body: { profile?: UserProfile; forecast?: ForecastDataPoint[] },
  apiKey?: string,
): Promise<{ plan: RawPlanItem[]; source: string; error?: string }> {
  const profile: UserProfile = body.profile || DEFAULT_PROFILE;
  const forecast: ForecastDataPoint[] = body.forecast || [];
  const cacheKey = computeCacheKey(profile, new Date().toISOString().slice(0, 10));

  const cached = PLAN_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PLAN_CACHE_TTL_MS) {
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
    PLAN_CACHE.set(cacheKey, { plan: validated, source: 'gemini', timestamp: Date.now() });
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const rawBody = parseRequestBody(req.body);
  const validationError = validatePlanRequestBody(rawBody);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  const body = rawBody as {
    profile?: UserProfile;
    forecast?: ForecastDataPoint[];
  };
  const result = await processPlanRequest(body, apiKey);
  return res.status(200).json(result);
}
