/**
 * Open-Meteo Air Quality & Shwas ML 48-Hour Forecast Service
 *
 * - Reads 48-hour ML forecasts for the nearest station from Supabase `public.forecasts`.
 * - If a fresh ML forecast (< 3 hours old, within 60 km) is available, returns it with
 *   `isMlForecast: true` and `modelMae` (synced from `ml/reports/metrics.md`).
 * - Otherwise falls back seamlessly to Open-Meteo live Air Quality API (direct `us_aqi`),
 *   and ultimately to offline sample data clearly labelled "sample data".
 * - Computes the best clean-air window strictly across upcoming hours (from now through next 24h).
 */

import { isSupabaseConfigured, supabase } from './supabase.js';
import mlMetrics from '../data/mlMetrics.json';
import { formatHourShort, formatHourFull, computeBestWindow } from '../shared/forecastWindow.js';
import type { ForecastDataPoint, BestAirWindow } from '../shared/forecastWindow.js';

export { formatHourShort, formatHourFull, computeBestWindow };
export type { ForecastDataPoint, BestAirWindow };

export const ML_FORECAST_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
export const ML_STATION_MAX_DISTANCE_KM = 60;

export interface SupabaseForecastRow {
  location_id: string;
  location_name: string;
  lat: number;
  lon: number;
  generated_at: string;
  target_time: string;
  horizon_hour: number;
  predicted_pm25: number;
  predicted_us_aqi: number;
  model_version?: string;
  model_mae?: number | null;
}

export interface ForecastResult {
  currentAqi: number;
  currentPm25: number;
  points: ForecastDataPoint[];
  isSampleData: boolean;
  sourceLabel: string;
  isMlForecast?: boolean;
  modelMae?: number;
  modelVersion?: string;
  mlLocationName?: string;
  generatedAt?: string;
  updatedAgoLabel?: string;
}

/**
 * Formats an ML forecast generated_at ISO timestamp as "updated X min ago".
 */
export function formatForecastUpdatedAgo(
  generatedAtIso?: string | null,
  now: Date = new Date(),
): string {
  if (!generatedAtIso) return '';
  const ts = new Date(generatedAtIso).getTime();
  if (isNaN(ts)) return '';
  const diffMin = Math.max(0, Math.round((now.getTime() - ts) / 60000));
  if (diffMin < 1) return 'updated just now';
  if (diffMin < 60) return `updated ${diffMin} min ago`;
  const hrs = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return remMin > 0 ? `updated ${hrs} hr ${remMin} min ago` : `updated ${hrs} hr ago`;
}

function classifyDayLabel(
  dateStr: string,
  pointDate: Date,
  todayStr: string,
  tomorrowStr: string,
): string {
  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';
  return pointDate.toLocaleDateString('en-US', { weekday: 'short' });
}

interface OpenMeteoHourlyPayload {
  time: string[];
  pm2_5: number[];
  us_aqi: number[];
}

function parseOpenMeteoHourly(hourly: OpenMeteoHourlyPayload, now: Date): ForecastResult {
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const points: ForecastDataPoint[] = [];
  let currentPoint: ForecastDataPoint | null = null;
  let minTimeDiff = Infinity;

  for (let i = 0; i < hourly.time.length; i++) {
    const isoTime = hourly.time[i];
    const pointDate = new Date(isoTime);
    const timestamp = pointDate.getTime();
    const hour = pointDate.getHours();
    const pm25 = Math.round((hourly.pm2_5[i] || 0) * 10) / 10;
    const usAqi = Math.round(hourly.us_aqi[i] || 0);

    const pt: ForecastDataPoint = {
      isoTime,
      timestamp,
      time: formatHourShort(hour),
      fullTime: formatHourFull(hour),
      hour,
      day: classifyDayLabel(isoTime.slice(0, 10), pointDate, todayStr, tomorrowStr),
      pm25,
      usAqi,
      aqi: usAqi,
      isPast: timestamp < now.getTime() - 45 * 60 * 1000,
    };
    points.push(pt);

    const diff = Math.abs(timestamp - now.getTime());
    if (diff < minTimeDiff) {
      minTimeDiff = diff;
      currentPoint = pt;
    }
  }

  const startIndex = currentPoint ? Math.max(0, points.indexOf(currentPoint)) : 0;
  const activePoints = points.slice(startIndex, startIndex + 48);

  return {
    currentAqi: currentPoint?.usAqi ?? 180,
    currentPm25: currentPoint?.pm25 ?? 140,
    points: activePoints.length >= 24 ? activePoints : points.slice(0, 48),
    isSampleData: false,
    sourceLabel: 'Open-Meteo Live API',
    isMlForecast: false,
  };
}

/**
 * Fetches real 48-hour air quality forecast from Open-Meteo API.
 * Uses Open-Meteo's own `us_aqi` and `pm2_5` fields directly.
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
    console.warn('[Shwas] Open-Meteo live request failed, using offline fallback:', err);
    return getOfflineFallbackForecast();
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function selectNearestStationRows(
  rows: SupabaseForecastRow[],
  latitude: number,
  longitude: number,
): SupabaseForecastRow[] | null {
  const byLocation = new Map<string, SupabaseForecastRow[]>();
  for (const row of rows) {
    if (!row?.location_id) continue;
    const list = byLocation.get(row.location_id) || [];
    list.push(row);
    byLocation.set(row.location_id, list);
  }

  let nearestRows: SupabaseForecastRow[] | null = null;
  let minDistance = Infinity;

  for (const stationRows of byLocation.values()) {
    if (stationRows.length < 24) continue;
    const sample = stationRows[0];
    const dist = haversineKm(latitude, longitude, Number(sample.lat), Number(sample.lon));
    if (dist <= ML_STATION_MAX_DISTANCE_KM && dist < minDistance) {
      minDistance = dist;
      nearestRows = stationRows;
    }
  }

  return nearestRows;
}

function mapMlRowsToPoints(rows: SupabaseForecastRow[], now: Date): ForecastDataPoint[] {
  const sorted = [...rows].sort((a, b) => a.horizon_hour - b.horizon_hour);
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  return sorted.map((row) => {
    const ptDate = new Date(row.target_time);
    const timestamp = ptDate.getTime();
    const hour = ptDate.getHours();
    const pm25 = Math.round(Math.max(0, Number(row.predicted_pm25)) * 10) / 10;
    const usAqi = Math.round(Math.max(0, Number(row.predicted_us_aqi)));

    return {
      isoTime: row.target_time,
      timestamp,
      time: formatHourShort(hour),
      fullTime: formatHourFull(hour),
      hour,
      day: classifyDayLabel(ptDate.toISOString().slice(0, 10), ptDate, todayStr, tomorrowStr),
      pm25,
      usAqi,
      aqi: usAqi,
      isPast: timestamp < now.getTime() - 45 * 60 * 1000,
    };
  });
}

function resolveModelMae(rowMae: number | null | undefined, defaultMae: number): number {
  return typeof rowMae === 'number' && !isNaN(rowMae) && rowMae > 0 ? rowMae : defaultMae;
}

/**
 * Pure helper: selects the nearest fresh (< 6h old) ML station forecast from Supabase rows.
 * Returns null if rows are empty, stale (>= 6h old), sparse (< 24h), or outside 60 km.
 */
export function resolveMlForecastFromRows(
  rows: SupabaseForecastRow[],
  latitude: number,
  longitude: number,
  now: Date = new Date(),
  defaultMae: number = mlMetrics.mae,
): ForecastResult | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const nearestRows = selectNearestStationRows(rows, latitude, longitude);
  if (!nearestRows) return null;

  const latestGenMs = Math.max(
    ...nearestRows.map((r) => new Date(r.generated_at).getTime()).filter((t) => !isNaN(t)),
  );
  if (!isFinite(latestGenMs)) return null;

  const ageMs = now.getTime() - latestGenMs;
  if (ageMs >= ML_FORECAST_MAX_AGE_MS || ageMs < -15 * 60 * 1000) {
    return null;
  }

  const points = mapMlRowsToPoints(nearestRows, now);
  const first = points[0];
  const resolvedMae = resolveModelMae(nearestRows[0].model_mae, defaultMae);
  const generatedAt = new Date(latestGenMs).toISOString();

  return {
    currentAqi: first?.usAqi ?? 180,
    currentPm25: first?.pm25 ?? 140,
    points: points.slice(0, 48),
    isSampleData: false,
    sourceLabel: `Model MAE ±${Math.round(resolvedMae)} µg/m³`,
    isMlForecast: true,
    modelMae: resolvedMae,
    modelVersion: nearestRows[0].model_version || mlMetrics.modelVersion,
    mlLocationName: nearestRows[0].location_name,
    generatedAt,
    updatedAgoLabel: formatForecastUpdatedAgo(generatedAt, now),
  };
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
 * Smart 48-hour forecast loader:
 * 1. Reads nearest location forecast from Supabase `public.forecasts`.
 * 2. If fresh (< 6h old) and within 60 km, returns Shwas ML forecast.
 * 3. Otherwise falls back automatically to Open-Meteo live forecast.
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
    console.warn('[Shwas] Supabase ML forecast lookup failed, falling back to Open-Meteo:', err);
  }

  return fallbackFn(latitude, longitude);
}

/**
 * Offline sample data fallback only — used when device is offline or API is unavailable.
 * Clearly labelled "sample data".
 */
export function getOfflineFallbackForecast(): ForecastResult {
  const points: ForecastDataPoint[] = [];
  const now = new Date();
  const currentHour = now.getHours();

  // Typical diurnal PM2.5 and EPA US AQI points
  const diurnalPm25 = [
    260,
    275,
    290,
    310,
    330,
    345, // 00:00 - 05:00
    355,
    360,
    340,
    290,
    230,
    180, // 06:00 - 11:00
    150,
    130,
    120,
    125,
    140,
    180, // 12:00 - 17:00
    220,
    260,
    290,
    305,
    295,
    275, // 18:00 - 23:00
  ];

  // EPA breakpoint standard US AQI values for corresponding PM2.5 levels
  const diurnalUsAqi = [
    310, 325, 340, 360, 380, 395, 405, 410, 390, 340, 280, 230, 200, 180, 170, 175, 190, 230, 270,
    310, 340, 355, 345, 325,
  ];

  for (let i = 0; i < 48; i++) {
    const ptDate = new Date(now.getTime() + i * 3600 * 1000);
    const hour = ptDate.getHours();
    const day = i < 24 ? 'Today' : 'Tomorrow';
    const pm25 = diurnalPm25[hour];
    const usAqi = diurnalUsAqi[hour];

    points.push({
      isoTime: ptDate.toISOString(),
      timestamp: ptDate.getTime(),
      time: formatHourShort(hour),
      fullTime: formatHourFull(hour),
      hour,
      day,
      pm25,
      usAqi,
      aqi: usAqi,
      isPast: false,
    });
  }

  const currentPm25 = diurnalPm25[currentHour];
  const currentAqi = diurnalUsAqi[currentHour];

  return {
    currentAqi,
    currentPm25,
    points,
    isSampleData: true,
    sourceLabel: 'Sample data (offline fallback)',
  };
}
