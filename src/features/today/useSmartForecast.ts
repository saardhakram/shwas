import { useEffect, useState } from 'react';
import {
  fetchSmartForecast,
  getOfflineFallbackForecast,
  type ForecastDataPoint,
} from '../../lib/forecast';

export function useSmartForecast(
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
