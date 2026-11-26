import { useState, useEffect, useMemo, useRef } from 'react';
import { useAirQuality } from '../../components/layout/AppLayout';
import {
  computeBestWindow,
  fetchSmartForecast,
  getOfflineFallbackForecast,
  type ForecastDataPoint,
} from '../../lib/forecast';
import {
  computeTodayExposureSummary,
  generateRuleBasedPlan,
  parsePlanCache,
} from '../../lib/planGenerator';
import { buildPlanDedupeKey, requestDailyPlanOnce } from '../../lib/planFetcher';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import { CLIENT_PLAN_TIMEOUT_MS } from '@shared/constants';
import { upsertTodayDailySavings } from '../../lib/communityService';
import type { RawPlanItem, UserProfile } from '../../types';

const FALLBACK_PROFILE: UserProfile = {
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

function readCompletedMap(dateStr: string): Record<string, boolean> {
  return storage.getJson<Record<string, boolean>>(STORAGE_KEYS.planCompleted(dateStr)) ?? {};
}

function getInitialPlanState(
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

export function useAnimatedNumber(target: number, resetKey: number, duration = 300): number {
  const [state, setState] = useState({ value: target, resetKey });
  const currentRef = useRef(target);

  useEffect(() => {
    let animationFrameId: number;

    if (state.resetKey !== resetKey || Math.abs(target - currentRef.current) < 0.01) {
      animationFrameId = requestAnimationFrame(() => {
        currentRef.current = target;
        setState({ value: target, resetKey });
      });
      return () => cancelAnimationFrame(animationFrameId);
    }

    let startTimestamp: number | null = null;
    const startValue = currentRef.current;
    const diff = target - startValue;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const nextVal = startValue + diff * (1 - Math.pow(1 - progress, 3));
      currentRef.current = nextVal;
      setState({ value: nextVal, resetKey });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        currentRef.current = target;
        setState({ value: target, resetKey });
      }
    };

    animationFrameId = requestAnimationFrame(step);
    const safetyTimer = setTimeout(() => {
      currentRef.current = target;
      setState({ value: target, resetKey });
    }, duration + 80);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(safetyTimer);
    };
  }, [target, resetKey, duration, state.resetKey]);

  return state.resetKey !== resetKey ? target : state.value;
}

function useSmartForecastLoader(
  profileLat: number,
  profileLon: number,
  profileLocName: string,
  setAirQuality: (aqi: number, pm25: number) => void,
  setCityName: (name: string) => void,
) {
  const [forecastPoints, setForecastPoints] = useState<ForecastDataPoint[]>(
    () => getOfflineFallbackForecast().points,
  );
  const [forecastNow, setForecastNow] = useState<Date>(() => new Date());
  const [isForecastReady, setIsForecastReady] = useState<boolean>(false);
  const [isSampleData, setIsSampleData] = useState<boolean>(true);
  const [isMlForecast, setIsMlForecast] = useState<boolean>(false);
  const [modelMae, setModelMae] = useState<number | null>(null);
  const [mlGeneratedAt, setMlGeneratedAt] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>('Sample data (offline fallback)');

  useEffect(() => {
    let active = true;

    fetchSmartForecast(profileLat, profileLon)
      .then((res) => {
        if (!active) return;
        setCityName(profileLocName);
        setForecastPoints(res.points);
        setForecastNow(new Date());
        setIsSampleData(res.isSampleData);
        setIsMlForecast(Boolean(res.isMlForecast));
        setModelMae(typeof res.modelMae === 'number' ? res.modelMae : null);
        setMlGeneratedAt(res.generatedAt ?? null);
        setSourceLabel(res.sourceLabel);
        if (res.currentAqi) setAirQuality(res.currentAqi, res.currentPm25);
      })
      .finally(() => {
        if (active) setIsForecastReady(true);
      });

    return () => {
      active = false;
    };
  }, [profileLat, profileLon, profileLocName, setAirQuality, setCityName]);

  return {
    forecastPoints,
    forecastNow,
    isForecastReady,
    isSampleData,
    isMlForecast,
    modelMae,
    mlGeneratedAt,
    sourceLabel,
  };
}

export function useTodayPlan() {
  const {
    aqi,
    pm25: outdoorPm25,
    selectedFamilyId,
    userProfile,
    isProfileReady,
    setAirQuality,
    setCityName,
  } = useAirQuality();

  const effectiveProfile: UserProfile = useMemo(() => {
    return userProfile?.family?.length ? userProfile : FALLBACK_PROFILE;
  }, [userProfile]);

  const forecast = useSmartForecastLoader(
    userProfile?.location?.lat || 28.6139,
    userProfile?.location?.lon || 77.209,
    userProfile?.location?.name || 'Delhi NCR',
    setAirQuality,
    setCityName,
  );

  const [initialPlan] = useState(() =>
    getInitialPlanState(effectiveProfile, forecast.forecastPoints),
  );
  const [rawPlanItems, setRawPlanItems] = useState<RawPlanItem[]>(initialPlan.items);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() =>
    readCompletedMap(new Date().toISOString().slice(0, 10)),
  );
  const [planSource, setPlanSource] = useState<string>(initialPlan.source);
  const [isPlanLoading, setIsPlanLoading] = useState<boolean>(initialPlan.isLoading);
  const [isStillThinking, setIsStillThinking] = useState<boolean>(false);

  const requestedPlanKeyRef = useRef<string | null>(initialPlan.cachedKey);
  const latestForecastRef = useRef<ForecastDataPoint[]>(forecast.forecastPoints);
  const effectiveProfileRef = useRef<UserProfile>(effectiveProfile);

  useEffect(() => {
    latestForecastRef.current = forecast.forecastPoints;
  }, [forecast.forecastPoints]);

  useEffect(() => {
    effectiveProfileRef.current = effectiveProfile;
  }, [effectiveProfile]);

  const bestWindow = useMemo(
    () => computeBestWindow(forecast.forecastPoints, forecast.forecastNow),
    [forecast.forecastPoints, forecast.forecastNow],
  );

  const planLang = effectiveProfile.language || 'en';
  const planLocName = effectiveProfile.location?.name || 'city';

  useEffect(() => {
    if (!isProfileReady || !forecast.isForecastReady) return;
    let active = true;
    const dateStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = buildPlanDedupeKey(planLang, planLocName, dateStr);
    const cachedEntry = parsePlanCache(storage.getItem(STORAGE_KEYS.planCache(dedupeKey)));

    if (cachedEntry?.source === 'gemini' && cachedEntry.items.length >= 5) {
      requestedPlanKeyRef.current = dedupeKey;
      Promise.resolve().then(() => {
        if (!active) return;
        setRawPlanItems(cachedEntry.items);
        setPlanSource('gemini');
        setIsPlanLoading(false);
        setIsStillThinking(false);
      });
      return () => {
        active = false;
      };
    }

    requestedPlanKeyRef.current = dedupeKey;
    const stillThinkingTimer = setTimeout(() => {
      if (active) setIsStillThinking(true);
    }, 6000);

    const promise = requestDailyPlanOnce({
      profile: effectiveProfileRef.current,
      forecast: latestForecastRef.current,
      profileReady: isProfileReady,
      forecastReady: forecast.isForecastReady,
      dateStr,
      timeoutMs: CLIENT_PLAN_TIMEOUT_MS,
    });

    if (!promise) {
      clearTimeout(stillThinkingTimer);
      return;
    }

    promise.then((result) => {
      clearTimeout(stillThinkingTimer);
      if (!active) return;
      setRawPlanItems(result.items);
      setPlanSource(result.source);
      setIsPlanLoading(false);
      setIsStillThinking(false);
    });

    return () => {
      active = false;
      clearTimeout(stillThinkingTimer);
    };
  }, [isProfileReady, forecast.isForecastReady, planLang, planLocName]);

  const togglePlanItem = (id: string) => {
    setCompletedMap((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      if (!updated[id]) delete updated[id];
      const dateStr = new Date().toISOString().slice(0, 10);
      storage.setJson(STORAGE_KEYS.planCompleted(dateStr), updated);
      return updated;
    });
  };

  const exposureSummary = useMemo(
    () =>
      computeTodayExposureSummary(
        effectiveProfile.family,
        outdoorPm25 || 240,
        effectiveProfile.home,
        selectedFamilyId,
        rawPlanItems,
        completedMap,
      ),
    [effectiveProfile, outdoorPm25, selectedFamilyId, rawPlanItems, completedMap],
  );

  useEffect(() => {
    if (exposureSummary.planItems.length === 0) return;
    const selfName = effectiveProfile.family?.[0]?.name || 'My Family';
    const familyLabel = selfName.toLowerCase() === 'me' ? 'My Family' : `${selfName}'s Family`;
    upsertTodayDailySavings(exposureSummary.checkedSavings, familyLabel);
  }, [exposureSummary.checkedSavings, exposureSummary.planItems.length, effectiveProfile.family]);

  const animatedExposure = useAnimatedNumber(
    exposureSummary.currentCigarettes,
    exposureSummary.heroCigarettes,
    300,
  );

  return {
    aqi,
    selectedFamilyId,
    locationName: effectiveProfile.location.name,
    ...forecast,
    bestWindow,
    planSource,
    isPlanLoading,
    isStillThinking,
    exposureSummary,
    animatedExposure,
    togglePlanItem,
  };
}
