// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { buildPlanDedupeKey } from '../../lib/planFetcher';
import { getOfflineFallbackForecast, type ForecastResult } from '../../lib/forecast';
import { generateRuleBasedPlan } from '../../lib/planGenerator';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import { FALLBACK_PROFILE } from './todayDefaults';
import { useTodayPlan } from './useTodayPlan';

const mockFetchSmartForecast = vi.fn();
const mockRequestDailyPlanOnce = vi.fn();
const mockUpsertSavings = vi.fn();
const mockAirQualityContext = {
  aqi: 214,
  pm25: 180,
  cityName: 'Delhi NCR',
  selectedFamilyId: 'all',
  userProfile: FALLBACK_PROFILE,
  isProfileReady: true,
  setSelectedFamilyId: vi.fn(),
  setAqi: vi.fn(),
  setAirQuality: vi.fn(),
  setCityName: vi.fn(),
  reloadProfile: vi.fn(),
};

vi.mock('../../components/layout/AppLayout', () => ({
  useAirQuality: () => mockAirQualityContext,
}));

vi.mock('../../lib/forecast', async () => {
  const actual = await vi.importActual<typeof import('../../lib/forecast')>('../../lib/forecast');
  return {
    ...actual,
    fetchSmartForecast: (...args: unknown[]) => mockFetchSmartForecast(...args),
  };
});

vi.mock('../../lib/planFetcher', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/planFetcher')>('../../lib/planFetcher');
  return {
    ...actual,
    requestDailyPlanOnce: (...args: unknown[]) => mockRequestDailyPlanOnce(...args),
  };
});

vi.mock('../../lib/communityService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/communityService')>(
    '../../lib/communityService',
  );
  return {
    ...actual,
    upsertTodayDailySavings: (...args: unknown[]) => mockUpsertSavings(...args),
  };
});

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useTodayPlan hook family', () => {
  let rafSpy: { mockRestore: () => void };

  beforeEach(() => {
    localStorage.clear();
    mockFetchSmartForecast.mockReset();
    mockRequestDailyPlanOnce.mockReset();
    mockUpsertSavings.mockReset().mockResolvedValue(undefined);
    let rafTime = 0;
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafTime += 500;
      cb(rafTime);
      return 0;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  it('loads smart forecast, fetches Gemini plan once, and toggles completion with savings sync', async () => {
    const forecast: ForecastResult = {
      ...getOfflineFallbackForecast(),
      isSampleData: false,
      isMlForecast: true,
      modelMae: 21,
      generatedAt: new Date().toISOString(),
      sourceLabel: 'Model MAE ±21 µg/m³',
    };
    const geminiPlan = generateRuleBasedPlan(FALLBACK_PROFILE, forecast.points);
    const forecastDeferred = createDeferred<ForecastResult>();
    const planDeferred = createDeferred<{ items: typeof geminiPlan; source: string }>();

    mockFetchSmartForecast.mockReturnValue(forecastDeferred.promise);
    mockRequestDailyPlanOnce.mockReturnValue(planDeferred.promise);

    const { result } = renderHook(() => useTodayPlan());

    await act(async () => {
      forecastDeferred.resolve(forecast);
      await Promise.resolve();
    });
    await act(async () => {
      planDeferred.resolve({ items: geminiPlan, source: 'gemini' });
      await Promise.resolve();
    });

    expect(result.current.isForecastReady).toBe(true);
    expect(result.current.planSource).toBe('gemini');
    expect(result.current.isPlanLoading).toBe(false);
    expect(result.current.isMlForecast).toBe(true);
    expect(result.current.modelMae).toBe(21);
    expect(result.current.exposureSummary.planItems.length).toBeGreaterThanOrEqual(6);
    expect(result.current.exposureSummary.checkedSavings).toBe(0);

    const firstId = result.current.exposureSummary.planItems[0].id;
    act(() => {
      result.current.togglePlanItem(firstId);
    });

    expect(result.current.exposureSummary.planItems[0].completed).toBe(true);
    expect(result.current.exposureSummary.checkedSavings).toBeGreaterThan(0);
    expect(mockUpsertSavings).toHaveBeenCalled();

    act(() => {
      result.current.togglePlanItem(firstId);
    });
    expect(result.current.exposureSummary.planItems[0].completed).toBe(false);
  });

  it('uses cached Gemini plan without invoking network request', async () => {
    const forecast = getOfflineFallbackForecast();
    const cachedItems = generateRuleBasedPlan(FALLBACK_PROFILE, forecast.points);
    const todayStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = buildPlanDedupeKey('en', 'Delhi NCR', todayStr);
    storage.setJson(STORAGE_KEYS.planCache(dedupeKey), {
      source: 'gemini',
      items: cachedItems,
      createdAt: new Date().toISOString(),
    });

    const forecastDeferred = createDeferred<ForecastResult>();
    mockFetchSmartForecast.mockReturnValue(forecastDeferred.promise);
    mockRequestDailyPlanOnce.mockReturnValue(null);

    const { result } = renderHook(() => useTodayPlan());

    await act(async () => {
      forecastDeferred.resolve(forecast);
      await Promise.resolve();
    });

    expect(result.current.isForecastReady).toBe(true);
    expect(result.current.planSource).toBe('gemini');
    expect(result.current.isPlanLoading).toBe(false);
    expect(mockRequestDailyPlanOnce).not.toHaveBeenCalled();
  });

  it('falls back cleanly when API returns offline rule-based plan', async () => {
    const forecast = getOfflineFallbackForecast();
    const fallbackItems = generateRuleBasedPlan(FALLBACK_PROFILE, forecast.points);
    const forecastDeferred = createDeferred<ForecastResult>();
    const planDeferred = createDeferred<{ items: typeof fallbackItems; source: string }>();
    mockFetchSmartForecast.mockReturnValue(forecastDeferred.promise);
    mockRequestDailyPlanOnce.mockReturnValue(planDeferred.promise);

    const { result } = renderHook(() => useTodayPlan());

    await act(async () => {
      forecastDeferred.resolve(forecast);
      await Promise.resolve();
    });
    await act(async () => {
      planDeferred.resolve({ items: fallbackItems, source: 'rule_based_fallback' });
      await Promise.resolve();
    });

    expect(result.current.isPlanLoading).toBe(false);
    expect(result.current.planSource).toBe('rule_based_fallback');
    expect(result.current.exposureSummary.totalPotentialSavings).toBeGreaterThan(0);
  });
});
