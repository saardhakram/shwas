/**
 * Open-Meteo batch PM2.5 fetching along sampled route coordinates.
 */

import { logger } from './logger';
import type { LatLon } from './routeExposure';

/**
 * Builds a single Open-Meteo Air Quality batch URL for multiple coordinates.
 */
export function buildOpenMeteoBatchUrl(points: LatLon[]): string {
  const lats = points.map((p) => p.lat.toFixed(4)).join(',');
  const lons = points.map((p) => p.lon.toFixed(4)).join(',');
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&hourly=pm2_5&forecast_days=2&timezone=auto`;
}

/**
 * Picks the hourly PM2.5 reading closest to `departureTime` from an Open-Meteo location payload.
 */
export function extractPm25ForTime(
  locationData: { hourly?: { time?: string[]; pm2_5?: Array<number | null> } },
  departureTime: Date,
  fallbackPm25: number,
): number {
  const times = locationData?.hourly?.time;
  const values = locationData?.hourly?.pm2_5;
  if (!Array.isArray(times) || !Array.isArray(values) || times.length === 0) {
    return fallbackPm25;
  }

  const targetMs = departureTime.getTime();
  let chosen: number | null = null;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const val = values[i];
    const parsedMs = new Date(times[i]).getTime();
    if (typeof val !== 'number' || isNaN(val) || isNaN(parsedMs)) continue;
    const diff = Math.abs(parsedMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      chosen = val;
    }
  }

  return chosen !== null ? Math.max(0, Math.round(chosen)) : fallbackPm25;
}

/**
 * Fetches PM2.5 for all sampled points across routes in ONE Open-Meteo request.
 */
export async function fetchRoutePointsPm25(
  points: LatLon[],
  departureTime: Date = new Date(),
  fallbackPm25 = 120,
): Promise<number[]> {
  if (!points || points.length === 0) return [];

  const url = buildOpenMeteoBatchUrl(points);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo batch returned ${res.status}`);
    }
    const json = await res.json();
    const entries = Array.isArray(json) ? json : [json];
    return points.map((_, idx) => {
      const entry = entries[idx] || entries[0];
      return extractPm25ForTime(entry, departureTime, fallbackPm25);
    });
  } catch (err) {
    logger.warn('[routeExposure] Open-Meteo batch fetch failed, using fallback PM2.5:', err);
    return points.map(() => fallbackPm25);
  }
}
