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

import { generateRuleBasedPlan } from '../src/lib/planGenerator';
import { UserProfile, RawPlanItem } from '../src/types';
import { ForecastDataPoint } from '../src/lib/forecast';
import { callGeminiWithRetry } from './geminiClient';

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
  apiKey?: string
): Promise<{ plan: RawPlanItem[]; source: string; error?: string }> {
  const profile: UserProfile = body.profile || {
    language: 'en',
    location: { lat: 28.6139, lon: 77.2090, name: 'Delhi NCR' },
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
    const forecastSummary = forecast.slice(0, 24).map((p) => {
      return `${p.time} (${p.day}): PM2.5 ${p.pm25} µg/m³, AQI ${p.usAqi}`;
    }).join('\n');

    const prompt = `You are Shwas, an expert urban air quality companion helping an Indian family navigate winter smog.
Generate a daily air plan of 6 to 8 prioritized, actionable items for this family based on their home, routine, and upcoming 24h air forecast.

USER PROFILE:
- Language: ${profile.language} (IMPORTANT: All action and reason text MUST be in "${profile.language}")
- City/Location: ${profile.location.name}
- Windows facing road: ${profile.home.windowsFacingRoad}
- Air purifier: ${profile.home.purifier}
- Kitchen chimney: ${profile.home.chimney}
- Cooking fuel: ${profile.home.cookingFuel}
- Commute mode: ${profile.home.commuteMode}
- Family members: ${profile.family.map(f => `${f.name} (age ${f.age}${f.flags.asthma ? ', asthma' : ''}${f.flags.heart ? ', heart' : ''}${f.flags.pregnancy ? ', pregnant' : ''}, ${f.routine.hoursOutside}h outside, ${f.routine.hoursAway}h away)`).join('; ')}

NEXT 24-HOUR AIR QUALITY FORECAST:
${forecastSummary || 'Morning peak PM2.5 ~320, afternoon clean window ~120, evening rush ~290'}

CRITICAL REQUIREMENTS:
1. Output a strict JSON array of 6 to 8 items with this exact schema:
[
  {
    "time": "7:30 AM",
    "action": "clear instruction in ${profile.language}",
    "reason": "why this helps in ${profile.language}",
    "category": "seal" | "ventilate" | "commute" | "purify" | "routine",
    "hours": 3.0,
    "before_pm25": 280,
    "after_pm25": 140
  }
]
2. "hours" is the realistic duration in hours this action protects the family (e.g. windows sealed 3h, commute 1h, airing 0.5h, cooking exhaust 1.5h, purifier overnight 8h).
3. "before_pm25" is the expected PM2.5 in µg/m³ without this action. "after_pm25" is the reduced PM2.5 with this action. Ensure before_pm25 > after_pm25.
4. Language: write the "action" and "reason" strings strictly in "${profile.language}". If language is "hi", use natural Hindi (हिंदी).
5. No markdown formatting, no backticks, no text outside the JSON array.`;

    const geminiResult = await callGeminiWithRetry({
      apiKey,
      prompt,
      temperature: 0.3,
      responseMimeType: 'application/json',
      maxServerBudgetMs: 20000,
    });

    const rawContent = geminiResult.text;
    const parsed = JSON.parse(rawContent);
    const candidateList = Array.isArray(parsed)
      ? parsed
      : (parsed?.plan || parsed?.items || []);

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
    console.warn('[Plan Generator] Falling back to rule-based plan:', err.message);
    const fallbackPlan = generateRuleBasedPlan(profile, forecast);
    return {
      plan: fallbackPlan,
      source: 'rule_based_fallback',
      error: err.message,
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
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const result = await processPlanRequest(body, apiKey);

  return res.status(200).json(result);
}
