import { CLIENT_ASK_TIMEOUT_MS } from '@shared/constants';
import type { ForecastDataPoint } from '../../lib/forecast';
import { logger } from '../../lib/logger';
import { parsePlanCache } from '../../lib/planGenerator';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import type { RawPlanItem, UserProfile } from '../../types';
import type { ChatMessage, MiniCardData } from './askHelpers';

export const DEFAULT_WELCOME_TEXT =
  'Namaste! Ask me about outdoor walks, kids’ play times, masks, or sealing your home today. I check your family profile and the next 24-hour forecast.';

export interface AskApiResult {
  answer?: string;
  miniCard?: MiniCardData | null;
  source?: 'gemini' | 'offline' | 'rate_limited';
  remainingToday?: number;
}

export function readCachedTodayPlan(lang: string, locName: string): RawPlanItem[] {
  const dateStr = new Date().toISOString().slice(0, 10);
  const cached = parsePlanCache(
    storage.getItem(STORAGE_KEYS.planCache(`${dateStr}_${lang}_${locName}`)),
  );
  return cached?.items?.length ? cached.items : [];
}

export async function postAskApi(params: {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  userProfile: UserProfile | null;
  language: string;
  pm25: number;
  aqi: number;
  forecast: ForecastDataPoint[];
  plan: RawPlanItem[];
  signal: AbortSignal;
}): Promise<AskApiResult> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      userId: params.userProfile?.id || 'guest',
      history: params.history,
      profile: params.userProfile || {
        language: params.language,
        location: { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
        family: [],
        home: {
          windowsFacingRoad: true,
          purifier: false,
          chimney: false,
          cookingFuel: 'lpg',
          commuteMode: 'metro',
        },
      },
      currentPm25: params.pm25,
      currentAqi: params.aqi,
      forecast: params.forecast,
      plan: params.plan,
    }),
    signal: params.signal,
  });

  if (!res.ok) throw new Error(`Ask API returned ${res.status}`);
  return (await res.json()) as AskApiResult;
}

export async function requestAskReply(params: {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  userProfile: UserProfile | null;
  language: string;
  pm25: number;
  aqi: number;
  forecast: ForecastDataPoint[];
  plan: RawPlanItem[];
  emptyText: string;
  offlineText: string;
}): Promise<{ reply: ChatMessage; remainingToday?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLIENT_ASK_TIMEOUT_MS);
  try {
    const data = await postAskApi({ ...params, signal: controller.signal });
    return {
      remainingToday: data.remainingToday,
      reply: {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: data.answer || params.emptyText,
        miniCard: data.miniCard || null,
        source: data.source,
      },
    };
  } catch (err) {
    logger.warn('[Ask] Request failed, showing offline message:', err);
    return {
      reply: {
        id: `err_${Date.now()}`,
        role: 'assistant',
        text: params.offlineText,
        source: 'offline',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
