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
  try {
    const raw = localStorage.getItem(`shwas_plan_completed_${dateStr}`);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function useAnimatedNumber(target: number, resetKey: number, duration = 300): number {
  const [state, setState] = useState({ value: target, resetKey });
  const currentRef = useRef(target);

  useEffect(() => {
    if (state.resetKey !== resetKey || Math.abs(target - currentRef.current) < 0.01) {
      currentRef.current = target;
      setState({ value: target, resetKey });
      return;
    }

    let startTimestamp: number | null = null;
    const startValue = currentRef.current;
    const diff = target - startValue;
    let animationFrameId: number;

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
  const [isForecastReady, setIsForecastReady] = useState<boolean>(false);
  const [isSampleData, setIsSampleData] = useState<boolean>(true);
  const [isMlForecast, setIsMlForecast] = useState<boolean>(false);
  const [modelMae, setModelMae] = useState<number | null>(null);
  const [mlGeneratedAt, setMlGeneratedAt] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>('Sample data (offline fallback)');

  useEffect(() => {
    let active = true;
    setCityName(profileLocName);

    fetchSmartForecast(profileLat, profileLon)
      .then((res) => {
        if (!active) return;
        setForecastPoints(res.points);
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

  const forecast = useSmartForecastLoader(
    userProfile?.location?.lat || 28.6139,
    userProfile?.location?.lon || 77.209,
    userProfile?.location?.name || 'Delhi NCR',
    setAirQuality,
    setCityName,
  );

  const [rawPlanItems, setRawPlanItems] = useState<RawPlanItem[]>([]);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() =>
    readCompletedMap(new Date().toISOString().slice(0, 10)),
  );
  const [planSource, setPlanSource] = useState<string>('loading');
  const [isPlanLoading, setIsPlanLoading] = useState<boolean>(false);
  const [isStillThinking, setIsStillThinking] = useState<boolean>(false);
  const requestedPlanKeyRef = useRef<string | null>(null);
  const latestForecastRef = useRef<ForecastDataPoint[]>(forecast.forecastPoints);

  const effectiveProfile: UserProfile = useMemo(() => {
    return userProfile?.family?.length ? userProfile : FALLBACK_PROFILE;
  }, [userProfile]);

  const effectiveProfileRef = useRef<UserProfile>(effectiveProfile);

  useEffect(() => {
    latestForecastRef.current = forecast.forecastPoints;
  }, [forecast.forecastPoints]);

  useEffect(() => {
    effectiveProfileRef.current = effectiveProfile;
  }, [effectiveProfile]);

  const bestWindow = useMemo(
    () => computeBestWindow(forecast.forecastPoints, new Date()),
    [forecast.forecastPoints],
  );

  const planLang = effectiveProfile.language || 'en';
  const planLocName = effectiveProfile.location?.name || 'city';

  useEffect(() => {
    let active = true;
    const dateStr = new Date().toISOString().slice(0, 10);
    const dedupeKey = buildPlanDedupeKey(planLang, planLocName, dateStr);
    const cachedEntry = parsePlanCache(localStorage.getItem(`shwas_plan_${dedupeKey}`));

    setCompletedMap(readCompletedMap(dateStr));

    if (cachedEntry && cachedEntry.items.length >= 5) {
      setRawPlanItems(cachedEntry.items);
      setPlanSource(cachedEntry.source);
      if (cachedEntry.source === 'gemini') {
        requestedPlanKeyRef.current = dedupeKey;
        setIsPlanLoading(false);
        setIsStillThinking(false);
        return;
      }
    } else {
      setRawPlanItems((prev) =>
        prev.length > 0
          ? prev
          : generateRuleBasedPlan(effectiveProfileRef.current, latestForecastRef.current),
      );
      setPlanSource((prev) => (prev === 'gemini' ? prev : 'loading'));
    }

    if (!isProfileReady || !forecast.isForecastReady) {
      setIsPlanLoading(true);
      return;
    }

    const alreadyRequested = requestedPlanKeyRef.current === dedupeKey;
    requestedPlanKeyRef.current = dedupeKey;
    if (!alreadyRequested) {
      setIsPlanLoading(true);
      setIsStillThinking(false);
    }

    const stillThinkingTimer = setTimeout(() => {
      if (active) setIsStillThinking(true);
    }, 6000);

    const promise = requestDailyPlanOnce({
      profile: effectiveProfileRef.current,
      forecast: latestForecastRef.current,
      profileReady: isProfileReady,
      forecastReady: forecast.isForecastReady,
      dateStr,
      timeoutMs: 28000,
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
      localStorage.setItem(`shwas_plan_completed_${dateStr}`, JSON.stringify(updated));
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
