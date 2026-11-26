/**
 * Vercel Serverless Function: /api/ask
 *
 * Server-side only: reads process.env.GEMINI_API_KEY via callGeminiWithRetry.
 * Never exposes the Gemini key to the browser.
 */

import { callGeminiWithRetry } from './_lib/geminiClient.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';
import { getErrorMessage, isRecord, parseRequestBody } from './_lib/types.js';
import type { UserProfile, RawPlanItem } from '../src/types/index.js';
import type { ForecastDataPoint } from '../src/shared/forecastWindow.js';

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

const USER_DAILY_COUNTS = new Map<string, number>();

export function clearAskRateLimitForTesting(): void {
  USER_DAILY_COUNTS.clear();
}

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extracts a 0..23 hour mentioned in the user's question as a deterministic fallback.
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

function resolveCardLevel(aqi: number): AskMiniCard['level'] {
  if (aqi <= 100) return 'good';
  if (aqi <= 200) return 'moderate';
  return 'high';
}

function resolveCardDuration(durationHours: number | null): number {
  if (typeof durationHours === 'number' && durationHours > 0 && durationHours <= 12) {
    return durationHours;
  }
  return 1;
}

/**
 * Computes an inline mini-card (AQI + cigarettes) in CODE for the time asked about.
 */
export function buildTimeMiniCard(
  targetHour: number | null,
  timeMentioned: string | null,
  durationHours: number | null,
  forecast: ForecastDataPoint[],
  currentPm25?: number,
  currentAqi?: number,
): AskMiniCard | null {
  if (targetHour === null || targetHour < 0 || targetHour > 23) return null;

  const hours = resolveCardDuration(durationHours);
  const matched = forecast.find((pt) => pt.hour === targetHour);
  const pm25 = Math.round(matched?.pm25 ?? currentPm25 ?? 150);
  const aqi = Math.round(matched?.usAqi ?? matched?.aqi ?? currentAqi ?? 180);
  const cigarettes = Number(((Math.max(0, pm25) * hours) / 528).toFixed(2));

  return {
    timeLabel: timeMentioned?.trim() || formatHour12(targetHour),
    aqi,
    pm25,
    cigarettes,
    durationHours: hours,
    level: resolveCardLevel(aqi),
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

function summarizeFamily(profile?: UserProfile): string {
  if (!profile?.family || profile.family.length === 0) {
    return 'Adult user (no specific health flags listed)';
  }
  return profile.family
    .map((f) => {
      const flags: string[] = [];
      if (f.flags?.asthma) flags.push('asthma');
      if (f.flags?.heart) flags.push('heart condition');
      if (f.flags?.pregnancy) flags.push('pregnant');
      const flagSuffix = flags.length ? `, ${flags.join(', ')}` : '';
      return `${f.name} (age ${f.age}${flagSuffix}, ${f.routine?.hoursOutside ?? 1}h outside, ${f.routine?.hoursAway ?? 6}h away)`;
    })
    .join('; ');
}

function buildAskPrompt(
  question: string,
  language: string,
  profile: UserProfile | undefined,
  currentPm25: number,
  currentAqi: number,
  forecast: ForecastDataPoint[],
  plan: RawPlanItem[],
  history?: AskHistoryTurn[],
): string {
  const homeSummary = profile?.home
    ? `windows facing road: ${profile.home.windowsFacingRoad}, purifier: ${profile.home.purifier}, chimney: ${profile.home.chimney}, fuel: ${profile.home.cookingFuel}, commute: ${profile.home.commuteMode}`
    : 'Standard urban apartment';

  const sampledForecast =
    forecast.length > 8 ? forecast.filter((_, idx) => idx % 3 === 0).slice(0, 8) : forecast;
  const forecastSummary =
    sampledForecast.length > 0
      ? sampledForecast
          .map((p) => `${p.fullTime || p.time}(${p.day}):PM2.5=${p.pm25},AQI=${p.usAqi}`)
          .join(' | ')
      : `Now:PM2.5=${currentPm25},AQI=${currentAqi}`;

  const planSummary =
    plan.length > 0
      ? plan
          .slice(0, 8)
          .map((p) => `${p.time}: ${String(p.action || '').slice(0, 72)}`)
          .join(' | ')
      : 'None';

  const historyText =
    Array.isArray(history) && history.length > 0
      ? history
          .slice(-4)
          .map((h) => `${h.role === 'user' ? 'U' : 'A'}: ${String(h.text || '').slice(0, 160)}`)
          .join('\n')
      : '';

  return `SYSTEM INSTRUCTIONS:
You are Shwas, a practical urban air quality assistant in India.
1. Answer briefly (2–3 short sentences) about air quality, masks, outdoor timing, ventilation, and family routines in "${language}".
2. NEVER give medical diagnoses; advise seeing a doctor for any symptoms.
3. Politely refuse unrelated topics and steer back to air quality.
4. Use only the provided forecast and plan numbers.

CONTEXT:
City: ${profile?.location?.name || 'Delhi NCR'} | Now: PM2.5 ${currentPm25} µg/m³, AQI ${currentAqi}
Family: ${summarizeFamily(profile)}
Home: ${homeSummary}
Next 24h (3h steps): ${forecastSummary}
Today's plan: ${planSummary}
${historyText ? `Recent chat:\n${historyText}\n` : ''}
QUESTION: "${question}"

Return STRICT JSON only:
{"answer":"short reply in ${language}","timeMentioned":"6:00 PM" or null,"targetHour":18 or null,"durationHours":1 or null}`;
}

interface ParsedAskReply {
  answerText: string;
  targetHour: number | null;
  timeMentioned: string | null;
  durationHours: number | null;
}

function parseGeminiAskReply(rawText: string, question: string): ParsedAskReply {
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let answerText = cleaned;
  let targetHour: number | null = null;
  let timeMentioned: string | null = null;
  let durationHours: number | null = null;

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (isRecord(parsed)) {
      if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
        answerText = parsed.answer.trim();
      }
      if (
        typeof parsed.targetHour === 'number' &&
        parsed.targetHour >= 0 &&
        parsed.targetHour <= 23
      ) {
        targetHour = Math.round(parsed.targetHour);
      }
      if (typeof parsed.timeMentioned === 'string' && parsed.timeMentioned.trim()) {
        timeMentioned = parsed.timeMentioned.trim();
      }
      if (typeof parsed.durationHours === 'number' && parsed.durationHours > 0) {
        durationHours = parsed.durationHours;
      }
    }
  } catch {
    // Plain text answer fallback if JSON parsing fails
  }

  return {
    answerText,
    targetHour: targetHour ?? parseHourFromQuestion(question),
    timeMentioned,
    durationHours,
  };
}

function consumeRateLimit(
  userId: string | undefined,
  profileId: string | undefined,
  clientId: string | undefined,
): { allowed: boolean; remainingToday: number } {
  const userKey = (userId || profileId || clientId || 'anonymous').trim();
  const rateKey = `${userKey}_${getTodayDateKey()}`;
  const usedCount = USER_DAILY_COUNTS.get(rateKey) || 0;
  if (usedCount >= DAILY_QUESTION_LIMIT) {
    return { allowed: false, remainingToday: 0 };
  }
  const nextCount = usedCount + 1;
  USER_DAILY_COUNTS.set(rateKey, nextCount);
  return { allowed: true, remainingToday: Math.max(0, DAILY_QUESTION_LIMIT - nextCount) };
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

function buildEmptyQuestionResponse(language: string): AskResponseBody {
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

export async function processAskRequest(
  body: AskRequestBody,
  apiKey?: string,
  clientId?: string,
): Promise<AskResponseBody> {
  const question = (body.question || '').trim();
  const profile = body.profile;
  const language = profile?.language || 'en';

  if (!question) {
    return buildEmptyQuestionResponse(language);
  }

  const rate = consumeRateLimit(body.userId, profile?.id, clientId);
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
      remainingToday: rate.remainingToday,
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
      maxServerBudgetMs: 35000,
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
      remainingToday: rate.remainingToday,
      limit: DAILY_QUESTION_LIMIT,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.warn('[api/ask] Gemini request failed:', message);
    return {
      answer: getFriendlyFallbackMessage(language),
      source: 'offline',
      miniCard: null,
      remainingToday: rate.remainingToday,
      limit: DAILY_QUESTION_LIMIT,
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
  const body = parseRequestBody(req.body) as AskRequestBody;
  const forwarded = req.headers?.['x-forwarded-for'];
  const clientIp =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress) ||
    'anonymous';

  const result = await processAskRequest(body, apiKey, clientIp);
  return res.status(200).json(result);
}
