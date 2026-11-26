/**
 * Single-flight client fetcher for POST /api/plan.
 *
 * Guarantees at most ONE POST /api/plan request per (date, language, location)
 * per page load — never re-firing on React StrictMode double-mounts or when
 * forecast/profile object references change identity.
 */

import type { UserProfile, RawPlanItem } from '../types/index.js';
import type { ForecastDataPoint } from '../shared/forecastWindow.js';
import { CLIENT_PLAN_TIMEOUT_MS } from '../shared/constants.js';
import { logger } from './logger.js';
import { generateRuleBasedPlan, parsePlanCache, serializePlanCache } from './planGenerator.js';

export interface DailyPlanFetchResult {
  items: RawPlanItem[];
  source: string;
  fromCache: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const inFlightRequests = new Map<string, Promise<DailyPlanFetchResult>>();
const completedRequests = new Map<string, DailyPlanFetchResult>();

export function buildPlanDedupeKey(
  language: string,
  locationName: string,
  dateStr: string = new Date().toISOString().slice(0, 10),
): string {
  return `${dateStr}_${language || 'en'}_${locationName || 'city'}`;
}

export function resetDailyPlanFetcherForTesting(): void {
  inFlightRequests.clear();
  completedRequests.clear();
}

export interface FetchDailyPlanParams {
  profile: UserProfile;
  forecast: ForecastDataPoint[];
  profileReady: boolean;
  forecastReady: boolean;
  dateStr?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  storage?: StorageLike | null;
}

function readCachedGeminiPlan(
  storage: StorageLike | null,
  cacheKey: string,
): DailyPlanFetchResult | null {
  if (!storage) return null;
  try {
    const cachedRaw = storage.getItem(cacheKey);
    const cachedEntry = parsePlanCache(cachedRaw);
    if (!cachedEntry || cachedEntry.items.length < 5) return null;

    if (cachedRaw && cachedRaw.trim().startsWith('[')) {
      storage.setItem(cacheKey, serializePlanCache(cachedEntry.source, cachedEntry.items));
    }
    if (cachedEntry.source !== 'gemini') return null;

    return { items: cachedEntry.items, source: 'gemini', fromCache: true };
  } catch {
    return null;
  }
}

async function fetchPlanFromServer(
  profile: UserProfile,
  forecast: ForecastDataPoint[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
  storage: StorageLike | null,
  cacheKey: string,
): Promise<DailyPlanFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, forecast: forecast.slice(0, 24) }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Plan API error: ${res.status}`);

    const data = (await res.json()) as { source?: unknown; plan?: unknown };
    const resolvedSource = typeof data?.source === 'string' ? data.source : 'rule_based';
    const items: RawPlanItem[] =
      Array.isArray(data?.plan) && data.plan.length >= 5
        ? (data.plan as RawPlanItem[])
        : generateRuleBasedPlan(profile, forecast);

    if (resolvedSource === 'gemini' && storage) {
      try {
        storage.setItem(cacheKey, serializePlanCache(resolvedSource, items));
      } catch {
        // ignore storage write errors
      }
    }

    return { items, source: resolvedSource, fromCache: false };
  } catch (err) {
    clearTimeout(timer);
    logger.warn('[TodayPage] Plan fetch dropped to rule generator fallback:', err);
    return { items: generateRuleBasedPlan(profile, forecast), source: 'offline', fromCache: false };
  }
}

/**
 * Fetches today's plan at most once per (date, language, location) per page load.
 * Returns null if profile or forecast is not ready yet.
 */
export function requestDailyPlanOnce(
  params: FetchDailyPlanParams,
): Promise<DailyPlanFetchResult> | null {
  const {
    profile,
    forecast,
    profileReady,
    forecastReady,
    dateStr = new Date().toISOString().slice(0, 10),
    timeoutMs = CLIENT_PLAN_TIMEOUT_MS,
    fetchImpl = fetch,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
  } = params;

  if (!profileReady || !forecastReady) return null;

  const dedupeKey = buildPlanDedupeKey(
    profile.language || 'en',
    profile.location?.name || 'city',
    dateStr,
  );
  const cacheKey = `shwas_plan_${dedupeKey}`;

  const cachedHit = readCachedGeminiPlan(storage, cacheKey);
  if (cachedHit) {
    completedRequests.set(dedupeKey, cachedHit);
    return Promise.resolve(cachedHit);
  }

  const completed = completedRequests.get(dedupeKey);
  if (completed) return Promise.resolve(completed);

  const existing = inFlightRequests.get(dedupeKey);
  if (existing) return existing;

  const promise = fetchPlanFromServer(profile, forecast, fetchImpl, timeoutMs, storage, cacheKey)
    .then((result) => {
      completedRequests.set(dedupeKey, result);
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(dedupeKey);
    });

  inFlightRequests.set(dedupeKey, promise);
  return promise;
}
