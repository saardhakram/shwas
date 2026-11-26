/**
 * Pure forecast parsing, ML station resolution, and offline fallback helpers.
 */

import mlMetrics from '../data/mlMetrics.json';
import { formatHourShort, formatHourFull } from '@shared/forecastWindow';
import type { ForecastDataPoint } from '@shared/forecastWindow';
import { ML_FORECAST_MAX_AGE_MS, ML_STATION_MAX_DISTANCE_KM } from '@shared/constants';

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

export interface OpenMeteoHourlyPayload {
  time: string[];
  pm2_5: number[];
  us_aqi: number[];
}

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

/**
 * Formats an ML forecast generated_at ISO timestamp as "updated X min ago".
 */
export function formatForecastUpdatedAgo(
  generatedAtIso?: string | null,
  now: Date = new Date(),
  t?: TranslateFn,
): string {
  if (!generatedAtIso) return '';
  const ts = new Date(generatedAtIso).getTime();
  if (isNaN(ts)) return '';
  const tr: TranslateFn =
    t ||
    ((_k, def, opts) =>
      opts ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : def);
  const diffMin = Math.max(0, Math.round((now.getTime() - ts) / 60000));
  if (diffMin < 1) return tr('today.updatedJustNow', 'updated just now');
  if (diffMin < 60) return tr('today.updatedMinAgo', 'updated {{min}} min ago', { min: diffMin });
  const hrs = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return remMin > 0
    ? tr('today.updatedHrMinAgo', 'updated {{hr}} hr {{min}} min ago', { hr: hrs, min: remMin })
    : tr('today.updatedHrAgo', 'updated {{hr}} hr ago', { hr: hrs });
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

export function parseOpenMeteoHourly(hourly: OpenMeteoHourlyPayload, now: Date): ForecastResult {
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
 * Selects the nearest fresh (< 6h old) ML station forecast from Supabase rows.
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
  if (ageMs >= ML_FORECAST_MAX_AGE_MS || ageMs < -15 * 60 * 1000) return null;

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
