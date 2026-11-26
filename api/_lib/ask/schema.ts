/**
 * Types, reply parser, and deterministic exposure mini-card math for `/api/ask`.
 */

import { PM25_HOURS_PER_CIGARETTE } from '../../../shared/constants.js';
import type { ForecastDataPoint } from '../../../shared/forecastWindow.js';
import type { RawPlanItem, UserProfile } from '../../../shared/types.js';
import { serverLogger } from '../logger.js';
import { isRecord } from '../types.js';

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

export interface ParsedAskReply {
  answerText: string;
  targetHour: number | null;
  timeMentioned: string | null;
  durationHours: number | null;
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
  const cigarettes = Number(((Math.max(0, pm25) * hours) / PM25_HOURS_PER_CIGARETTE).toFixed(2));

  return {
    timeLabel: timeMentioned?.trim() || formatHour12(targetHour),
    aqi,
    pm25,
    cigarettes,
    durationHours: hours,
    level: resolveCardLevel(aqi),
  };
}

export function parseGeminiAskReply(rawText: string, question: string): ParsedAskReply {
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
  } catch (err: unknown) {
    serverLogger.warn(
      '[api/ask] Gemini reply was not strict JSON, using plain-text fallback:',
      err,
    );
  }

  return {
    answerText,
    targetHour: targetHour ?? parseHourFromQuestion(question),
    timeMentioned,
    durationHours,
  };
}
