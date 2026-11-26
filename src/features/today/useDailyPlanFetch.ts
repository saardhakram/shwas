import { useEffect, useRef, useState } from 'react';
import { CLIENT_PLAN_TIMEOUT_MS } from '@shared/constants';
import type { ForecastDataPoint } from '../../lib/forecast';
import { buildPlanDedupeKey, requestDailyPlanOnce } from '../../lib/planFetcher';
import { parsePlanCache } from '../../lib/planGenerator';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import type { RawPlanItem, UserProfile } from '../../types';
import { getInitialPlanState } from './todayDefaults';

export function useDailyPlanFetch(params: {
  effectiveProfile: UserProfile;
  forecastPoints: ForecastDataPoint[];
  isProfileReady: boolean;
  isForecastReady: boolean;
}) {
  const { effectiveProfile, forecastPoints, isProfileReady, isForecastReady } = params;
  const [initialPlan] = useState(() => getInitialPlanState(effectiveProfile, forecastPoints));
  const [rawPlanItems, setRawPlanItems] = useState<RawPlanItem[]>(initialPlan.items);
  const [planSource, setPlanSource] = useState<string>(initialPlan.source);
  const [isPlanLoading, setIsPlanLoading] = useState<boolean>(initialPlan.isLoading);
  const [isStillThinking, setIsStillThinking] = useState<boolean>(false);

  const requestedPlanKeyRef = useRef<string | null>(initialPlan.cachedKey);
  const latestForecastRef = useRef<ForecastDataPoint[]>(forecastPoints);
  const effectiveProfileRef = useRef<UserProfile>(effectiveProfile);

  useEffect(() => {
    latestForecastRef.current = forecastPoints;
  }, [forecastPoints]);

  useEffect(() => {
    effectiveProfileRef.current = effectiveProfile;
  }, [effectiveProfile]);

  const planLang = effectiveProfile.language || 'en';
  const planLocName = effectiveProfile.location?.name || 'city';

  useEffect(() => {
    if (!isProfileReady || !isForecastReady) return;
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
      forecastReady: isForecastReady,
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
  }, [isProfileReady, isForecastReady, planLang, planLocName]);

  return { rawPlanItems, planSource, isPlanLoading, isStillThinking };
}
