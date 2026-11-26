import type { ForecastDataPoint } from '../../lib/forecast';
import { buildPlanDedupeKey } from '../../lib/planFetcher';
import { generateRuleBasedPlan, parsePlanCache } from '../../lib/planGenerator';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import type { RawPlanItem, UserProfile } from '../../types';

export function getInitialPlanState(
  profile: UserProfile,
  initialForecast: ForecastDataPoint[],
): { items: RawPlanItem[]; source: string; isLoading: boolean; cachedKey: string | null } {
  const dateStr = new Date().toISOString().slice(0, 10);
  const dedupeKey = buildPlanDedupeKey(
    profile.language || 'en',
    profile.location?.name || 'city',
    dateStr,
  );
  const cached = parsePlanCache(storage.getItem(STORAGE_KEYS.planCache(dedupeKey)));
  if (cached && cached.items.length >= 5) {
    return {
      items: cached.items,
      source: cached.source,
      isLoading: cached.source !== 'gemini',
      cachedKey: cached.source === 'gemini' ? dedupeKey : null,
    };
  }
  return {
    items: generateRuleBasedPlan(profile, initialForecast),
    source: 'loading',
    isLoading: true,
    cachedKey: null,
  };
}

export const FALLBACK_PROFILE: UserProfile = {
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
    {
      id: 'grandpa',
      name: 'Grandpa',
      age: 72,
      flags: { heart: true },
      routine: { hoursOutside: 1, hoursAway: 0, awayPlace: 'none' },
    },
    {
      id: 'child',
      name: 'Aarav',
      age: 8,
      flags: { asthma: true },
      routine: { hoursOutside: 1.5, hoursAway: 6, awayPlace: 'school' },
    },
  ],
  home: {
    windowsFacingRoad: true,
    purifier: true,
    chimney: true,
    cookingFuel: 'lpg',
    commuteMode: 'metro',
    windowsShut: true,
  },
};
