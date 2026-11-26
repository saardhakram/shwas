import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestDailyPlanOnce, resetDailyPlanFetcherForTesting, StorageLike } from './planFetcher';
import { serializePlanCache, generateRuleBasedPlan } from './planGenerator';
import type { UserProfile } from '../types';
import type { ForecastDataPoint } from '../shared/forecastWindow';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

const makeProfile = (locName = 'Delhi NCR'): UserProfile => ({
  id: 'u1',
  language: 'en',
  location: { lat: 28.6139, lon: 77.209, name: locName },
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
});

const makeForecast = (pm25 = 180): ForecastDataPoint[] => [
  {
    isoTime: '2026-11-26T14:00:00Z',
    timestamp: Date.now(),
    time: '2 PM',
    fullTime: '2:00 PM',
    hour: 14,
    day: 'Today',
    pm25,
    usAqi: 210,
    aqi: 210,
    isPast: false,
  },
];

describe('planFetcher.ts (single POST /api/plan per page load)', () => {
  beforeEach(() => {
    resetDailyPlanFetcherForTesting();
  });

  it('does not call /api/plan until both profileReady and forecastReady are true', () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const storage = createMemoryStorage();

    expect(
      requestDailyPlanOnce({
        profile: makeProfile(),
        forecast: makeForecast(),
        profileReady: false,
        forecastReady: true,
        fetchImpl: fetchSpy,
        storage,
      }),
    ).toBeNull();

    expect(
      requestDailyPlanOnce({
        profile: makeProfile(),
        forecast: makeForecast(),
        profileReady: true,
        forecastReady: false,
        fetchImpl: fetchSpy,
        storage,
      }),
    ).toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls POST /api/plan exactly ONCE across repeated renders, StrictMode double-mounts, and new forecast/location object identities', async () => {
    const geminiPlan = generateRuleBasedPlan(makeProfile());
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ source: 'gemini', plan: geminiPlan }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const storage = createMemoryStorage();

    // Simulate 4 back-to-back renders with freshly allocated profile, location, and forecast objects
    const p1 = requestDailyPlanOnce({
      profile: makeProfile('Delhi NCR'),
      forecast: makeForecast(180),
      profileReady: true,
      forecastReady: true,
      dateStr: '2026-11-26',
      fetchImpl: fetchSpy,
      storage,
    });
    const p2 = requestDailyPlanOnce({
      profile: makeProfile('Delhi NCR'),
      forecast: makeForecast(182),
      profileReady: true,
      forecastReady: true,
      dateStr: '2026-11-26',
      fetchImpl: fetchSpy,
      storage,
    });
    const p3 = requestDailyPlanOnce({
      profile: makeProfile('Delhi NCR'),
      forecast: makeForecast(185),
      profileReady: true,
      forecastReady: true,
      dateStr: '2026-11-26',
      fetchImpl: fetchSpy,
      storage,
    });

    const [r1, r2, r3] = await Promise.all([p1!, p2!, p3!]);

    // A 4th call after resolution with new object references must STILL not call fetch again
    const r4 = await requestDailyPlanOnce({
      profile: makeProfile('Delhi NCR'),
      forecast: makeForecast(190),
      profileReady: true,
      forecastReady: true,
      dateStr: '2026-11-26',
      fetchImpl: fetchSpy,
      storage,
    })!;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r1.source).toBe('gemini');
    expect(r2.source).toBe('gemini');
    expect(r3.source).toBe('gemini');
    expect(r4.source).toBe('gemini');
  });

  it('upgrades a cached offline plan with a single /api/plan call and caches the Gemini result', async () => {
    const storage = createMemoryStorage();
    const profile = makeProfile('Delhi NCR');
    const offlineItems = generateRuleBasedPlan(profile);
    storage.setItem(
      'shwas_plan_2026-11-26_en_Delhi NCR',
      serializePlanCache('offline', offlineItems),
    );

    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ source: 'gemini', plan: offlineItems }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await requestDailyPlanOnce({
      profile,
      forecast: makeForecast(),
      profileReady: true,
      forecastReady: true,
      dateStr: '2026-11-26',
      fetchImpl: fetchSpy,
      storage,
    })!;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('gemini');

    // Subsequent page load (after reset) hits the persisted Gemini cache with 0 fetches
    resetDailyPlanFetcherForTesting();
    const cachedResult = await requestDailyPlanOnce({
      profile,
      forecast: makeForecast(),
      profileReady: true,
      forecastReady: true,
      dateStr: '2026-11-26',
      fetchImpl: fetchSpy,
      storage,
    })!;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cachedResult.source).toBe('gemini');
    expect(cachedResult.fromCache).toBe(true);
  });
});
