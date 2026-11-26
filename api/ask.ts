/**
 * Vercel Serverless Function: /api/ask
 *
 * Server-side only: reads process.env.GEMINI_API_KEY via callGeminiWithRetry.
 * Never exposes the Gemini key to the browser.
 *
 * Features:
 * - Passes user's question, family/home profile, current PM2.5/AQI, next 24h forecast, and today's plan.
 * - System instructions: brief, practical air quality & health guidance in user's language;
 *   no medical diagnoses; suggest seeing a doctor for symptoms; refuse unrelated topics politely.
 * - Computes inline mini-card (AQI + cigarettes for the time asked about) strictly in CODE.
 * - Enforces 20 questions per user per day rate limit.
 */

import { callGeminiWithRetry } from './geminiClient';
import { UserProfile, RawPlanItem } from '../src/types';
import { ForecastDataPoint } from '../src/lib/forecast';

export const DAILY_QUESTION_LIMIT = 20;

export interface AskHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AskMiniCard {
  timeLabel: string;
  aqi: number;
  pm25: number;
  cigarettes: number;
  durationHours: number;
  level: 'good' | 'moderate' | 'high';
}

export interface AskRequestBody {
  question?: string;
  userId?: string;
  history?: AskHistoryTurn[];
  profile?: UserProfile;
  currentPm25?: number;
  currentAqi?: number;
  forecast?: ForecastDataPoint[];
  plan?: RawPlanItem[];
}

export interface AskResponseBody {
  answer: string;
  source: 'gemini' | 'offline' | 'rate_limited';
  miniCard?: AskMiniCard | null;
  remainingToday: number;
  limit: number;
  error?: string;
}

// In-memory per-user daily question counter: key = `${userKey}_${YYYY-MM-DD}`
const USER_DAILY_COUNTS = new Map<string, number>();

export function clearAskRateLimitForTesting(): void {
  USER_DAILY_COUNTS.clear();
}

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extracts a 0..23 hour mentioned in the user's question as a deterministic fallback
 * (e.g. "6 PM" -> 18, "7:30 am" -> 7).
 */
export function parseHourFromQuestion(question: string): number | null {
  const match = question.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const period = match[3].toLowerCase();
    if (period === 'pm' && h < 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return h;
  }
  const lower = question.toLowerCase();
  if (lower.includes('morning')) return 8;
  if (lower.includes('afternoon')) return 14;
  if (lower.includes('evening')) return 18;
  if (lower.includes('tonight') || lower.includes('night')) return 21;
  return null;
}

function formatHour12(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

/**
 * Computes an inline mini-card (AQI + cigarettes) in CODE for the time asked about,
 * using the live/forecast PM2.5 and US AQI from the 24h forecast array.
 */
export function buildTimeMiniCard(
  targetHour: number | null,
  timeMentioned: string | null,
  durationHours: number | null,
  forecast: ForecastDataPoint[],
  currentPm25?: number,
  currentAqi?: number
): AskMiniCard | null {
  if (targetHour === null || targetHour < 0 || targetHour > 23) return null;

  const hours =
    typeof durationHours === 'number' && durationHours > 0 && durationHours <= 12
      ? durationHours
      : 1;

  // Match the first upcoming forecast point with that hour
  const matched = forecast.find((pt) => pt.hour === targetHour);
  const pm25 = Math.round(matched?.pm25 ?? currentPm25 ?? 150);
  const aqi = Math.round(matched?.usAqi ?? matched?.aqi ?? currentAqi ?? 180);

  // Berkeley Earth cigarette equivalence: 22 µg/m³ for 24h = 1 cigarette (divisor 528)
  const cigarettes = Number(((Math.max(0, pm25) * hours) / 528).toFixed(2));
  const level: AskMiniCard['level'] =
    aqi <= 100 ? 'good' : aqi <= 200 ? 'moderate' : 'high';

  return {
    timeLabel: timeMentioned?.trim() || formatHour12(targetHour),
    aqi,
    pm25,
    cigarettes,
    durationHours: hours,
    level,
  };
}

function getFriendlyFallbackMessage(language: string): string {
  if (language === 'hi') {
    return 'माफ़ कीजिए, अभी श्वास AI से संपर्क नहीं हो पा रहा है। कृपया कुछ देर बाद दोबारा पूछें या आज की वायु योजना देखें। यदि सांस लेने में तकलीफ़ या खाँसी हो, तो कृपया डॉक्टर से सलाह लें।';
  }
  return 'Sorry, I could not reach Gemini right now. Please try again in a moment, or check your Today tab for the cleanest air window. If anyone is experiencing coughing or breathing trouble, please consult a doctor.';
}

function getRateLimitMessage(language: string): string {
  if (language === 'hi') {
    return `आप आज के ${DAILY_QUESTION_LIMIT} सवालों की सीमा तक पहुँच चुके हैं। कल फिर पूछें — तब तक अपनी दैनिक वायु योजना और स्वच्छ रास्ते देखें।`;
  }
  return `You've reached today's limit of ${DAILY_QUESTION_LIMIT} questions. Please check back tomorrow — your Today plan and Clean Routes remain available anytime.`;
}

export async function processAskRequest(
  body: AskRequestBody,
  apiKey?: string,
  clientId?: string
): Promise<AskResponseBody> {
  const question = (body.question || '').trim();
  const profile = body.profile;
  const language = profile?.language || 'en';

  if (!question) {
    return {
      answer:
        language === 'hi'
          ? 'कृपया वायु गुणवत्ता या परिवार के स्वास्थ्य से जुड़ा कोई सवाल पूछें।'
          : 'Please ask a question about air quality, masks, or your family routine.',
      source: 'offline',
      remainingToday: DAILY_QUESTION_LIMIT,
      limit: DAILY_QUESTION_LIMIT,
      error: 'empty_question',
    };
  }

  // Enforce 20 questions per user per day
  const userKey = (body.userId || profile?.id || clientId || 'anonymous').trim();
  const rateKey = `${userKey}_${getTodayDateKey()}`;
  const usedCount = USER_DAILY_COUNTS.get(rateKey) || 0;

  if (usedCount >= DAILY_QUESTION_LIMIT) {
    return {
      answer: getRateLimitMessage(language),
      source: 'rate_limited',
      remainingToday: 0,
      limit: DAILY_QUESTION_LIMIT,
      error: 'daily_limit_reached',
    };
  }

  const forecast = Array.isArray(body.forecast) ? body.forecast.slice(0, 24) : [];
  const plan = Array.isArray(body.plan) ? body.plan.slice(0, 8) : [];
  const currentPm25 = typeof body.currentPm25 === 'number' ? body.currentPm25 : forecast[0]?.pm25 ?? 150;
  const currentAqi = typeof body.currentAqi === 'number' ? body.currentAqi : forecast[0]?.usAqi ?? 180;

  // Increment count for valid attempt
  const nextCount = usedCount + 1;
  USER_DAILY_COUNTS.set(rateKey, nextCount);
  const remainingToday = Math.max(0, DAILY_QUESTION_LIMIT - nextCount);

  if (!apiKey) {
    return {
      answer: getFriendlyFallbackMessage(language),
      source: 'offline',
      miniCard: null,
      remainingToday,
      limit: DAILY_QUESTION_LIMIT,
      error: 'missing_api_key',
    };
  }

  try {
    const familySummary =
      profile?.family && profile.family.length > 0
        ? profile.family
            .map((f) => {
              const flags: string[] = [];
              if (f.flags?.asthma) flags.push('asthma');
              if (f.flags?.heart) flags.push('heart condition');
              if (f.flags?.pregnancy) flags.push('pregnant');
              return `${f.name} (age ${f.age}${flags.length ? ', ' + flags.join(', ') : ''}, ${f.routine?.hoursOutside ?? 1}h outside, ${f.routine?.hoursAway ?? 6}h away)`;
            })
            .join('; ')
        : 'Adult user (no specific health flags listed)';

    const homeSummary = profile?.home
      ? `windows facing road: ${profile.home.windowsFacingRoad}, purifier: ${profile.home.purifier}, chimney: ${profile.home.chimney}, fuel: ${profile.home.cookingFuel}, commute: ${profile.home.commuteMode}`
      : 'Standard urban apartment';

    const forecastSummary =
      forecast.length > 0
        ? forecast
            .map((p) => `${p.fullTime || p.time} (${p.day}): PM2.5 ${p.pm25} µg/m³, AQI ${p.usAqi}`)
            .join('\n')
        : `Current: PM2.5 ${currentPm25} µg/m³, AQI ${currentAqi}`;

    const planSummary =
      plan.length > 0
        ? plan.map((p) => `- ${p.time}: ${p.action}`).join('\n')
        : 'No custom plan items loaded.';

    const historyText =
      Array.isArray(body.history) && body.history.length > 0
        ? body.history
            .slice(-4)
            .map((h) => `${h.role === 'user' ? 'User' : 'Shwas'}: ${h.text}`)
            .join('\n')
        : '';

    const prompt = `SYSTEM INSTRUCTIONS:
You are Shwas, a warm, practical urban air quality assistant helping families in India protect their lungs.
Follow these strict rules:
1. Answer briefly (2 to 4 short sentences) and practically about air quality, smog exposure, outdoor timing, masks, home ventilation, purifiers, and family routines.
2. Always respond strictly in the user's language: "${language}" (e.g. if "hi", write natural Hindi; if "en", write clear English).
3. NEVER give medical diagnoses or prescribe medications. If the user mentions symptoms (coughing, wheezing, chest pain, breathlessness, asthma attack, dizziness), clearly advise seeing a doctor.
4. Politely refuse unrelated topics (e.g. coding, sports scores, politics, trivia) and redirect to air quality and breathing health.
5. Ground your timing advice in the provided 24-hour forecast and today's plan. Do not invent fake AQI numbers.

USER CONTEXT:
- City: ${profile?.location?.name || 'Delhi NCR'}
- Current Air: PM2.5 ${currentPm25} µg/m³, US AQI ${currentAqi}
- Family: ${familySummary}
- Home: ${homeSummary}

NEXT 24-HOUR FORECAST:
${forecastSummary}

TODAY'S AIR PLAN:
${planSummary}
${historyText ? `\nRECENT SESSION CHAT:\n${historyText}\n` : ''}
USER QUESTION:
"${question}"

OUTPUT FORMAT (STRICT JSON ONLY, no markdown):
{
  "answer": "your concise, practical answer in ${language}",
  "timeMentioned": "6:00 PM" or null (if user asked about a specific time of day or outing window),
  "targetHour": 18 or null (integer 0-23 matching the time asked about, else null),
  "durationHours": 1 or null (estimated outing duration in hours if relevant, e.g. 0.5 or 1, else null)
}`;

    const geminiRes = await callGeminiWithRetry({
      apiKey,
      prompt,
      temperature: 0.3,
      responseMimeType: 'application/json',
      maxServerBudgetMs: 20000,
    });

    const cleaned = geminiRes.text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let answerText = cleaned;
    let targetHour: number | null = null;
    let timeMentioned: string | null = null;
    let durationHours: number | null = null;

    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed?.answer === 'string' && parsed.answer.trim()) {
        answerText = parsed.answer.trim();
      }
      if (typeof parsed?.targetHour === 'number' && parsed.targetHour >= 0 && parsed.targetHour <= 23) {
        targetHour = Math.round(parsed.targetHour);
      }
      if (typeof parsed?.timeMentioned === 'string' && parsed.timeMentioned.trim()) {
        timeMentioned = parsed.timeMentioned.trim();
      }
      if (typeof parsed?.durationHours === 'number' && parsed.durationHours > 0) {
        durationHours = parsed.durationHours;
      }
    } catch {
      // Plain text answer fallback if JSON parsing fails
    }

    // Fallback time parsing from user question if Gemini omitted targetHour
    if (targetHour === null) {
      targetHour = parseHourFromQuestion(question);
    }

    const miniCard = buildTimeMiniCard(
      targetHour,
      timeMentioned,
      durationHours,
      forecast,
      currentPm25,
      currentAqi
    );

    return {
      answer: answerText,
      source: 'gemini',
      miniCard,
      remainingToday,
      limit: DAILY_QUESTION_LIMIT,
    };
  } catch (err: any) {
    console.warn('[api/ask] Gemini request failed:', err?.message || err);
    return {
      answer: getFriendlyFallbackMessage(language),
      source: 'offline',
      miniCard: null,
      remainingToday,
      limit: DAILY_QUESTION_LIMIT,
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
  const clientIp =
    (typeof req.headers?.['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.socket?.remoteAddress) || 'anonymous';

  const result = await processAskRequest(body, apiKey, clientIp);
  return res.status(200).json(result);
}
