/**
 * Open-Meteo Air Quality & Shwas ML 48-Hour Forecast Service
 */

import { isSupabaseConfigured, supabase } from './supabase.js';
import { logger } from './logger.js';
import {
  computeLocalDayOffset,
  dayKeyFromOffset,
  formatHourShort,
  formatHourFull,
  computeBestWindow,
} from '@shared/forecastWindow';
import type { ForecastDataPoint, BestAirWindow } from '@shared/forecastWindow';
import {
  ML_FORECAST_MAX_AGE_MS,
  ML_FORECAST_STALE_WARN_AGE_MS,
  ML_STATION_MAX_DISTANCE_KM,
} from '@shared/constants';
import {
  formatForecastUpdatedAgo,
  isMlForecastStaleWarning,
  parseOpenMeteoHourly,
  resolveMlForecastFromRows,
  type ForecastResult,
  type OpenMeteoHourlyPayload,
  type SupabaseForecastRow,
} from './forecastCalc.js';

export {
  formatHourShort,
  formatHourFull,
  computeBestWindow,
  formatForecastUpdatedAgo,
  isMlForecastStaleWarning,
  resolveMlForecastFromRows,
  ML_FORECAST_MAX_AGE_MS,
  ML_FORECAST_STALE_WARN_AGE_MS,
  ML_STATION_MAX_DISTANCE_KM,
};
export type { ForecastDataPoint, BestAirWindow, ForecastResult, SupabaseForecastRow };

const DIURNAL_PM25 = [
  260, 275, 290, 310, 330, 345, 355, 360, 340, 290, 230, 180, 150, 130, 120, 125, 140, 180, 220,
  260, 290, 305, 295, 275,
];

const DIURNAL_US_AQI = [
  310, 325, 340, 360, 380, 395, 405, 410, 390, 340, 280, 230, 200, 180, 170, 175, 190, 230, 270,
  310, 340, 355, 345, 325,
];

/**
 * Offline sample data fallback used when device is offline or API is unavailable.
 */
export function getOfflineFallbackForecast(): ForecastResult {
  const points: ForecastDataPoint[] = [];
  const now = new Date();
  const currentHour = now.getHours();

  for (let i = 0; i < 48; i++) {
    const ptDate = new Date(now.getTime() + i * 3600 * 1000);
    const hour = ptDate.getHours();
    const dayOffset = computeLocalDayOffset(ptDate, now);
    const pm25 = DIURNAL_PM25[hour];
    const usAqi = DIURNAL_US_AQI[hour];

    points.push({
      isoTime: ptDate.toISOString(),
      timestamp: ptDate.getTime(),
      time: formatHourShort(hour),
      fullTime: formatHourFull(hour),
      hour,
      day: dayKeyFromOffset(dayOffset),
      dayOffset,
      pm25,
      usAqi,
      aqi: usAqi,
      isPast: false,
    });
  }

  return {
    currentAqi: DIURNAL_US_AQI[currentHour],
    currentPm25: DIURNAL_PM25[currentHour],
    points,
    isSampleData: true,
    sourceLabel: 'Sample data (offline fallback)',
  };
}

/**
 * Fetches real 48-hour air quality forecast from Open-Meteo API.
 */
export async function fetchOpenMeteoForecast(
  latitude = 28.6139,
  longitude = 77.209,
): Promise<ForecastResult> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=pm2_5,us_aqi&timezone=auto&forecast_days=3`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo API returned status ${res.status}`);
    }

    const data = await res.json();
    const hourly = data?.hourly;
    if (!hourly?.time || !hourly?.pm2_5 || !hourly?.us_aqi) {
      throw new Error('Invalid Open-Meteo response structure');
    }

    return parseOpenMeteoHourly(hourly as OpenMeteoHourlyPayload, new Date());
  } catch (err) {
    logger.warn('[Shwas] Open-Meteo live request failed, using offline fallback:', err);
    return getOfflineFallbackForecast();
  }
}

async function querySupabaseForecastRows(): Promise<SupabaseForecastRow[] | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('forecasts')
    .select(
      'location_id,location_name,lat,lon,generated_at,target_time,horizon_hour,predicted_pm25,predicted_us_aqi,model_version,model_mae',
    )
    .order('horizon_hour', { ascending: true });

  if (error || !Array.isArray(data)) return null;
  return data as SupabaseForecastRow[];
}

/**
 * Smart 48-hour forecast loader: tries Supabase ML forecast (covering current hour + 24h,
 * <= 24h old, <= 60 km), then falls back automatically to Open-Meteo live forecast.
 */
export async function fetchSmartForecast(
  latitude = 28.6139,
  longitude = 77.209,
  deps?: {
    loadSupabaseRows?: () => Promise<SupabaseForecastRow[] | null>;
    fallbackFetch?: (lat: number, lon: number) => Promise<ForecastResult>;
    now?: Date;
  },
): Promise<ForecastResult> {
  const now = deps?.now ?? new Date();
  const fallbackFn = deps?.fallbackFetch ?? fetchOpenMeteoForecast;

  try {
    const rows = deps?.loadSupabaseRows
      ? await deps.loadSupabaseRows()
      : await querySupabaseForecastRows();

    const mlResult = rows?.length
      ? resolveMlForecastFromRows(rows, latitude, longitude, now)
      : null;
    if (mlResult) return mlResult;
  } catch (err) {
    logger.warn('[Shwas] Supabase ML forecast lookup failed, falling back to Open-Meteo:', err);
  }

  return fallbackFn(latitude, longitude);
}
