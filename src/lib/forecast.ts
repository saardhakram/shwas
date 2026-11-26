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

import { isSupabaseConfigured, supabase } from './supabase';
import mlMetrics from '../data/mlMetrics.json';

export const ML_FORECAST_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
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

export interface ForecastDataPoint {
  isoTime: string;      // e.g. "2026-11-20T14:00"
  timestamp: number;    // epoch milliseconds
  time: string;         // e.g. "2 PM"
  fullTime: string;     // e.g. "2:00 PM"
  hour: number;         // 0 - 23
  day: 'Today' | 'Tomorrow' | string;
  pm25: number;         // raw PM2.5 in µg/m³
  usAqi: number;        // Direct from Open-Meteo's us_aqi
  aqi: number;          // alias for usAqi
  isPast: boolean;
}

export interface BestAirWindow {
  startHour: number;
  endHour: number;
  startTime: string;
  endTime: string;
  dayLabel: string;
  label: string;
  shortLabel: string;
  chartStart: string;
  chartEnd: string;
  avgPm25: number;
  avgAqi: number;
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
}

export function formatHourShort(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayH} ${period}`;
}

export function formatHourFull(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayH}:00 ${period}`;
}

/**
 * Fetches real 48-hour air quality forecast from Open-Meteo API.
 * Uses Open-Meteo's own `us_aqi` and `pm2_5` fields directly.
 */
export async function fetchOpenMeteoForecast(
  latitude = 28.6139,
  longitude = 77.2090
): Promise<ForecastResult> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=pm2_5,us_aqi&timezone=auto&forecast_days=3`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo API returned status ${res.status}`);
    }

    const data = await res.json();
    if (!data?.hourly?.time || !data?.hourly?.pm2_5 || !data?.hourly?.us_aqi) {
      throw new Error('Invalid Open-Meteo response structure');
    }

    const times: string[] = data.hourly.time;
    const pm25Arr: number[] = data.hourly.pm2_5;
    const usAqiArr: number[] = data.hourly.us_aqi;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const points: ForecastDataPoint[] = [];
    let currentPoint: ForecastDataPoint | null = null;
    let minTimeDiff = Infinity;

    for (let i = 0; i < times.length; i++) {
      const isoTime = times[i];
      const pointDate = new Date(isoTime);
      const timestamp = pointDate.getTime();
      const hour = pointDate.getHours();
      const dateStr = isoTime.slice(0, 10);

      let day = 'Later';
      if (dateStr === todayStr) {
        day = 'Today';
      } else if (dateStr === tomorrowStr) {
        day = 'Tomorrow';
      } else {
        day = pointDate.toLocaleDateString('en-US', { weekday: 'short' });
      }

      const pm25 = Math.round((pm25Arr[i] || 0) * 10) / 10;
      // Direct Open-Meteo us_aqi (no formula)
      const usAqi = Math.round(usAqiArr[i] || 0);

      const isPast = timestamp < now.getTime() - 45 * 60 * 1000;

      const pt: ForecastDataPoint = {
        isoTime,
        timestamp,
        time: formatHourShort(hour),
        fullTime: formatHourFull(hour),
        hour,
        day,
        pm25,
        usAqi,
        aqi: usAqi,
        isPast,
      };

      points.push(pt);

      // Identify the closest hour to current time for live indicators
      const diff = Math.abs(timestamp - now.getTime());
      if (diff < minTimeDiff) {
        minTimeDiff = diff;
        currentPoint = pt;
      }
    }

    // Keep next 48 hours of points starting from current hour
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

/**
 * Pure helper: selects the nearest fresh (< 3h old) ML station forecast from Supabase rows.
 * Returns null if rows are empty, stale (>= 3h old), sparse (< 24h), or outside 60 km.
 */
export function resolveMlForecastFromRows(
  rows: SupabaseForecastRow[],
  latitude: number,
  longitude: number,
  now: Date = new Date(),
  defaultMae: number = mlMetrics.mae
): ForecastResult | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Group rows by location_id
  const byLocation = new Map<string, SupabaseForecastRow[]>();
  for (const row of rows) {
    if (!row?.location_id) continue;
    const list = byLocation.get(row.location_id) || [];
    list.push(row);
    byLocation.set(row.location_id, list);
  }

  // Pick nearest station within ML_STATION_MAX_DISTANCE_KM
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

  if (!nearestRows || nearestRows.length < 24) return null;

  // Check freshness (< 3 hours old)
  const latestGenMs = Math.max(
    ...nearestRows.map((r) => new Date(r.generated_at).getTime()).filter((t) => !isNaN(t))
  );
  if (!isFinite(latestGenMs)) return null;

  const ageMs = now.getTime() - latestGenMs;
  if (ageMs >= ML_FORECAST_MAX_AGE_MS || ageMs < -15 * 60 * 1000) {
    return null;
  }

  const sorted = [...nearestRows].sort((a, b) => a.horizon_hour - b.horizon_hour);
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const points: ForecastDataPoint[] = sorted.map((row) => {
    const ptDate = new Date(row.target_time);
    const timestamp = ptDate.getTime();
    const hour = ptDate.getHours();
    const dateStr = ptDate.toISOString().slice(0, 10);

    let day = 'Later';
    if (dateStr === todayStr) {
      day = 'Today';
    } else if (dateStr === tomorrowStr) {
      day = 'Tomorrow';
    } else {
      day = ptDate.toLocaleDateString('en-US', { weekday: 'short' });
    }

    const pm25 = Math.round(Math.max(0, Number(row.predicted_pm25)) * 10) / 10;
    const usAqi = Math.round(Math.max(0, Number(row.predicted_us_aqi)));

    return {
      isoTime: row.target_time,
      timestamp,
      time: formatHourShort(hour),
      fullTime: formatHourFull(hour),
      hour,
      day,
      pm25,
      usAqi,
      aqi: usAqi,
      isPast: timestamp < now.getTime() - 45 * 60 * 1000,
    };
  });

  const first = points[0];
  const rowMae = nearestRows[0].model_mae;
  const resolvedMae =
    typeof rowMae === 'number' && !isNaN(rowMae) && rowMae > 0 ? rowMae : defaultMae;

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
  };
}

/**
 * Smart 48-hour forecast loader:
 * 1. Reads nearest location forecast from Supabase `public.forecasts`.
 * 2. If fresh (< 3h old) and within 60 km, returns Shwas ML forecast.
 * 3. Otherwise falls back automatically to Open-Meteo live forecast.
 */
export async function fetchSmartForecast(
  latitude = 28.6139,
  longitude = 77.2090,
  deps?: {
    loadSupabaseRows?: () => Promise<SupabaseForecastRow[] | null>;
    fallbackFetch?: (lat: number, lon: number) => Promise<ForecastResult>;
    now?: Date;
  }
): Promise<ForecastResult> {
  const now = deps?.now ?? new Date();
  const fallbackFn = deps?.fallbackFetch ?? fetchOpenMeteoForecast;

  try {
    let rows: SupabaseForecastRow[] | null = null;
    if (deps?.loadSupabaseRows) {
      rows = await deps.loadSupabaseRows();
    } else if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('forecasts')
        .select(
          'location_id,location_name,lat,lon,generated_at,target_time,horizon_hour,predicted_pm25,predicted_us_aqi,model_version,model_mae'
        )
        .order('horizon_hour', { ascending: true });

      if (!error && Array.isArray(data)) {
        rows = data as SupabaseForecastRow[];
      }
    }

    if (rows && rows.length > 0) {
      const mlResult = resolveMlForecastFromRows(rows, latitude, longitude, now);
      if (mlResult) {
        return mlResult;
      }
    }
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
    260, 275, 290, 310, 330, 345, // 00:00 - 05:00
    355, 360, 340, 290, 230, 180, // 06:00 - 11:00
    150, 130, 120, 125, 140, 180, // 12:00 - 17:00
    220, 260, 290, 305, 295, 275, // 18:00 - 23:00
  ];

  // EPA breakpoint standard US AQI values for corresponding PM2.5 levels
  const diurnalUsAqi = [
    310, 325, 340, 360, 380, 395,
    405, 410, 390, 340, 280, 230,
    200, 180, 170, 175, 190, 230,
    270, 310, 340, 355, 345, 325,
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

/**
 * Computes the best clean-air window.
 *
 * CRITICAL RULE:
 * Must search upcoming hours from `now` through the next 24 hours.
 * Never suggests a window that has already passed today.
 *
 * @param forecast Array of forecast points
 * @param fromDate Reference date/time (defaults to new Date())
 */
export function computeBestWindow(
  forecast: ForecastDataPoint[],
  fromDate: Date = new Date()
): BestAirWindow {
  const fromTime = fromDate.getTime();
  const maxUpcomingTime = fromTime + 24 * 3600 * 1000;

  // Filter to upcoming hours only: from (now - 15m) up to +24 hours
  const upcoming = forecast.filter((p) => {
    return p.timestamp >= fromTime - 15 * 60 * 1000 && p.timestamp <= maxUpcomingTime;
  });

  if (upcoming.length < 2) {
    // Fallback if upcoming points are sparse
    const defaultStart = fromDate.getHours() < 14 ? '2:00 PM' : 'Tomorrow 2:00 PM';
    const defaultEnd = fromDate.getHours() < 14 ? '4:00 PM' : 'Tomorrow 4:00 PM';
    return {
      startHour: 14,
      endHour: 16,
      startTime: '2:00 PM',
      endTime: '4:00 PM',
      dayLabel: fromDate.getHours() < 14 ? 'Today' : 'Tomorrow',
      label: `${defaultStart} – ${defaultEnd}`,
      shortLabel: fromDate.getHours() < 14 ? '2–4 PM' : 'Tmrw 2–4 PM',
      chartStart: '2 PM',
      chartEnd: '4 PM',
      avgPm25: 120,
      avgAqi: 175,
    };
  }

  // Find consecutive 2-hour window with lowest average PM2.5 in upcoming 24h
  let minAvg = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < upcoming.length - 1; i++) {
    const avg = (upcoming[i].pm25 + upcoming[i + 1].pm25) / 2;
    if (avg < minAvg) {
      minAvg = avg;
      bestIdx = i;
    }
  }

  const startPt = upcoming[bestIdx];
  const endPt = upcoming[bestIdx + 1];

  const sameDayAsNow =
    new Date(startPt.timestamp).toDateString() === fromDate.toDateString();
  const dayPrefix = sameDayAsNow ? '' : `${startPt.day} `;

  const label = `${dayPrefix}${startPt.fullTime} – ${endPt.fullTime}`;
  const shortLabel = `${dayPrefix}${startPt.time}–${endPt.time}`;
  const avgAqi = Math.round((startPt.usAqi + endPt.usAqi) / 2);

  return {
    startHour: startPt.hour,
    endHour: endPt.hour,
    startTime: startPt.fullTime,
    endTime: endPt.fullTime,
    dayLabel: startPt.day,
    label,
    shortLabel,
    chartStart: startPt.time,
    chartEnd: endPt.time,
    avgPm25: Math.round(minAvg),
    avgAqi,
  };
}
