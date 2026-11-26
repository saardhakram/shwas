/**
 * Vercel Serverless Function: /api/plan
 *
 * Server-side only: reads process.env.GEMINI_API_KEY.
 * Never exposes the Gemini key to the browser.
 * Generates 6-8 structured plan items via Gemini with strict JSON response;
 * validates output and returns a rule-based fallback on any failure.
 *
 * Includes:
 * - In-memory server cache keyed by date + language + location + family/home hash (TTL 6 hours)
 * - Duration in hours per plan item so cigarette savings can be accurately calculated
 */

import { generateRuleBasedPlan } from '../src/shared/planRules.js';
import type { UserProfile, RawPlanItem } from '../src/types/index.js';
import type { ForecastDataPoint } from '../src/shared/forecastWindow.js';
import { callGeminiWithRetry } from './_lib/geminiClient.js';

interface CacheEntry {
  plan: RawPlanItem[];
  source: string;
  timestamp: number;
}

// In-memory cache with 6-hour TTL (21,600,000 ms)
const PLAN_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

export async function processPlanRequest(
  body: { profile?: UserProfile; forecast?: ForecastDataPoint[] },
  apiKey?: string,
): Promise<{ plan: RawPlanItem[]; source: string; error?: string }> {
  const profile: UserProfile = body.profile || {
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

  const forecast: ForecastDataPoint[] = body.forecast || [];
  const dateStr = new Date().toISOString().slice(0, 10);
  const cacheKey = computeCacheKey(profile, dateStr);

  // Check 6-hour in-memory server cache
  const cached = PLAN_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      plan: cached.plan,
      source: cached.source,
    };
  }

  if (!apiKey) {
    const fallbackPlan = generateRuleBasedPlan(profile, forecast);
    return {
      plan: fallbackPlan,
      source: 'rule_based_no_key',
    };
  }

  try {
    // Compact forecast: sample at most 8 points (every 3h) for fast Gemini response
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
      .map(
        (f) =>
          `${f.name}(${f.age}${f.flags.asthma ? ',asthma' : ''}${f.flags.heart ? ',heart' : ''}${f.flags.pregnancy ? ',pregnant' : ''},${f.routine.hoursOutside}h out,${f.routine.hoursAway}h away)`,
      )
      .join('; ');

    const prompt = `You are Shwas, an Indian urban air quality assistant. Build a concise daily air plan of 6 items strictly in language "${profile.language}".

PROFILE: City=${profile.location.name} | RoadWindows=${profile.home.windowsFacingRoad} | Purifier=${profile.home.purifier} | Chimney=${profile.home.chimney} | Fuel=${profile.home.cookingFuel} | Commute=${profile.home.commuteMode}
FAMILY: ${familySummary}
NEXT 24H (3h steps): ${forecastSummary}

Return ONLY a JSON array of 6 items (no markdown):
[{"time":"7:30 AM","action":"short instruction in ${profile.language}","reason":"short reason in ${profile.language}","category":"seal|ventilate|commute|purify|routine","hours":3,"before_pm25":280,"after_pm25":140}]
Rules: hours > 0; before_pm25 > after_pm25; keep action <= 12 words and reason <= 14 words.`;

    const geminiResult = await callGeminiWithRetry({
      apiKey,
      prompt,
      temperature: 0.25,
      maxOutputTokens: 900,
      thinkingLevel: 'minimal',
      responseMimeType: 'application/json',
      maxServerBudgetMs: 25000,
    });

    const rawContent = geminiResult.text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(rawContent);
    const candidateList = Array.isArray(parsed) ? parsed : parsed?.plan || parsed?.items || [];

    // Validate that candidateList has at least 5 valid items
    if (!Array.isArray(candidateList) || candidateList.length < 5) {
      throw new Error(`Invalid item count: ${candidateList?.length}`);
    }

    const validated: RawPlanItem[] = candidateList.map((item, idx) => {
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

    // Save in server cache
    PLAN_CACHE.set(cacheKey, {
      plan: validated,
      source: 'gemini',
      timestamp: Date.now(),
    });

    return {
      plan: validated,
      source: 'gemini',
    };
  } catch (err: any) {
    const attemptsDetail = Array.isArray(err?.attempts)
      ? err.attempts
          .map((a: any) => `${a.model} status=${a.status} (${String(a.error || '').slice(0, 120)})`)
          .join(' | ')
      : 'no_attempt_details';
    console.warn(
      `[api/plan] Gemini failure (${attemptsDetail}) — falling back to rule-based plan. Error: ${err?.message || err}`,
    );
    const fallbackPlan = generateRuleBasedPlan(profile, forecast);
    return {
      plan: fallbackPlan,
      source: 'rule_based_fallback',
      error: err?.message || 'gemini_failed',
    };
  }
}

// Vercel Serverless Function default export
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const result = await processPlanRequest(body, apiKey);

  return res.status(200).json(result);
}
