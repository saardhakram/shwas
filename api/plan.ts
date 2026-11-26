/**
 * Vercel Serverless Function: /api/plan
 *
 * Server-side only: reads process.env.GEMINI_API_KEY.
 * Never exposes the Gemini key to the browser.
 * Generates 6-8 structured plan items via Gemini with strict JSON response;
 * validates output and returns a rule-based fallback on any failure.
 */

import { generateRuleBasedPlan } from '../src/lib/planGenerator';
import { UserProfile, RawPlanItem } from '../src/types';
import { ForecastDataPoint } from '../src/lib/forecast';

export async function processPlanRequest(
  body: { profile?: UserProfile; forecast?: ForecastDataPoint[] },
  apiKey?: string
): Promise<{ plan: RawPlanItem[]; source: string; error?: string }> {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

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

  if (!apiKey) {
    return {
      plan: generateRuleBasedPlan(profile, forecast),
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
    "before_pm25": 280,
    "after_pm25": 140
  }
]
2. "before_pm25" is the expected PM2.5 in µg/m³ without this action. "after_pm25" is the reduced PM2.5 with this action. Ensure before_pm25 > after_pm25.
3. Language: write the "action" and "reason" strings strictly in "${profile.language}". If language is "hi", use natural Hindi (हिंदी).
4. No markdown formatting, no backticks, no text outside the JSON array.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gemini API error] Status ${response.status}:`, errorText);
      return {
        plan: generateRuleBasedPlan(profile, forecast),
        source: 'rule_based_api_error',
        error: `Gemini status ${response.status}`,
      };
    }

    const result = await response.json();
    const rawContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error('Empty Gemini response content');
    }

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
      return {
        time: String(item.time || `${7 + idx * 2}:00 AM`),
        action: String(item.action || 'Clean air action'),
        reason: String(item.reason || 'Reduces particulate matter exposure.'),
        category: String(item.category || 'routine'),
        before_pm25: Math.max(before, after + 20),
        after_pm25: Math.min(before - 20, after),
      };
    });

    return {
      plan: validated,
      source: 'gemini',
    };
  } catch (err: any) {
    console.warn('[Plan Generator] Falling back to rule-based plan:', err.message);
    return {
      plan: generateRuleBasedPlan(profile, forecast),
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
