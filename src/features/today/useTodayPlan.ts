import { useEffect, useMemo, useState } from 'react';
import { useAirQuality } from '../../components/layout/AppLayout';
import { computeBestWindow } from '../../lib/forecast';
import { computeTodayExposureSummary } from '../../lib/planGenerator';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import { upsertTodayDailySavings } from '../../lib/communityService';
import type { UserProfile } from '../../types';
import { FALLBACK_PROFILE } from './todayDefaults';
import { useAnimatedNumber } from './useAnimatedNumber';
import { useDailyPlanFetch } from './useDailyPlanFetch';
import { useSmartForecast } from './useSmartForecast';

export { useAnimatedNumber };

function readCompletedMap(dateStr: string): Record<string, boolean> {
  return storage.getJson<Record<string, boolean>>(STORAGE_KEYS.planCompleted(dateStr)) ?? {};
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

  const effectiveProfile: UserProfile = useMemo(
    () => (userProfile?.family?.length ? userProfile : FALLBACK_PROFILE),
    [userProfile],
  );

  const forecast = useSmartForecast(
    userProfile?.location?.lat || 28.6139,
    userProfile?.location?.lon || 77.209,
    userProfile?.location?.name || 'Delhi NCR',
    setAirQuality,
    setCityName,
  );

  const plan = useDailyPlanFetch({
    effectiveProfile,
    forecastPoints: forecast.forecastPoints,
    isProfileReady,
    isForecastReady: forecast.isForecastReady,
  });

  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() =>
    readCompletedMap(new Date().toISOString().slice(0, 10)),
  );

  const bestWindow = useMemo(
    () => computeBestWindow(forecast.forecastPoints, forecast.forecastNow),
    [forecast.forecastPoints, forecast.forecastNow],
  );

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
        plan.rawPlanItems,
        completedMap,
      ),
    [effectiveProfile, outdoorPm25, selectedFamilyId, plan.rawPlanItems, completedMap],
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
    planSource: plan.planSource,
    isPlanLoading: plan.isPlanLoading,
    isStillThinking: plan.isStillThinking,
    exposureSummary,
    animatedExposure,
    togglePlanItem,
  };
}
