/**
 * Single-flight client fetcher for POST /api/plan.
 *
 * Guarantees at most ONE POST /api/plan request per (date, language, location)
 * per page load — never re-firing on React StrictMode double-mounts or when
 * forecast/profile object references change identity.
 */

import type { UserProfile, RawPlanItem } from '../types/index.js';
import type { ForecastDataPoint } from '../shared/forecastWindow.js';
import {
  generateRuleBasedPlan,
  parsePlanCache,
  serializePlanCache,
} from './planGenerator.js';

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
  dateStr: string = new Date().toISOString().slice(0, 10)
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

/**
 * Fetches today's plan at most once per (date, language, location) per page load.
 * Returns null if profile or forecast is not ready yet.
 */
export function requestDailyPlanOnce(
  params: FetchDailyPlanParams
): Promise<DailyPlanFetchResult> | null {
  const {
    profile,
    forecast,
    profileReady,
    forecastReady,
    dateStr = new Date().toISOString().slice(0, 10),
    timeoutMs = 28000,
    fetchImpl = fetch,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
  } = params;

  if (!profileReady || !forecastReady) {
    return null;
  }

  const dedupeKey = buildPlanDedupeKey(
    profile.language || 'en',
    profile.location?.name || 'city',
    dateStr
  );
  const cacheKey = `shwas_plan_${dedupeKey}`;

  // 1. Check persisted Gemini cache first
  if (storage) {
    try {
      const cachedRaw = storage.getItem(cacheKey);
      const cachedEntry = parsePlanCache(cachedRaw);
      if (cachedEntry && cachedEntry.items.length >= 5) {
        if (cachedRaw && cachedRaw.trim().startsWith('[')) {
          storage.setItem(cacheKey, serializePlanCache(cachedEntry.source, cachedEntry.items));
        }
        if (cachedEntry.source === 'gemini') {
          const hit: DailyPlanFetchResult = {
            items: cachedEntry.items,
            source: 'gemini',
            fromCache: true,
          };
          completedRequests.set(dedupeKey, hit);
          return Promise.resolve(hit);
        }
      }
    } catch {
      // ignore storage read errors
    }
  }

  // 2. Already completed for this page load -> never re-fetch
  const completed = completedRequests.get(dedupeKey);
  if (completed) {
    return Promise.resolve(completed);
  }

  // 3. Coalesce concurrent / StrictMode / re-render calls into the exact same request
  const existing = inFlightRequests.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<DailyPlanFetchResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          forecast: forecast.slice(0, 24),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Plan API error: ${res.status}`);
      }

      const data = await res.json();
      const resolvedSource = typeof data?.source === 'string' ? data.source : 'rule_based';
      const items: RawPlanItem[] =
        Array.isArray(data?.plan) && data.plan.length >= 5
          ? data.plan
          : generateRuleBasedPlan(profile, forecast);

      if (resolvedSource === 'gemini' && storage) {
        try {
          storage.setItem(cacheKey, serializePlanCache(resolvedSource, items));
        } catch {
          // ignore storage write errors
        }
      }

      const result: DailyPlanFetchResult = {
        items,
        source: resolvedSource,
        fromCache: false,
      };
      completedRequests.set(dedupeKey, result);
      return result;
    } catch (err) {
      clearTimeout(timer);
      console.warn('[TodayPage] Plan fetch dropped to rule generator fallback:', err);
      const fallbackResult: DailyPlanFetchResult = {
        items: generateRuleBasedPlan(profile, forecast),
        source: 'offline',
        fromCache: false,
      };
      completedRequests.set(dedupeKey, fallbackResult);
      return fallbackResult;
    } finally {
      inFlightRequests.delete(dedupeKey);
    }
  })();

  inFlightRequests.set(dedupeKey, promise);
  return promise;
}
