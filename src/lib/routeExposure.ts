/**
 * Shwas Clean Routes — Exposure & CO2 Engine
 *
 * All health exposure, cigarette equivalence, CO2 emissions, and route
 * recommendations are computed strictly in deterministic code (never LLM).
 *
 * Scientific & Empirical Constants:
 * 1. Cigarette Equivalence (Berkeley Earth):
 *    22 µg/m³ PM2.5 over 24h = 1 cigarette => 22 × 24 = 528 (µg·h/m³ per cigarette).
 *    Route cigarettes = avgPM2.5 × travel_hours × mode_factor ÷ 528.
 *
 * 2. Mode Microenvironment Exposure Factors (in-traffic vs ambient PM2.5):
 *    - car (windows shut, AC recirc): 0.6  (cabin filter & enclosure cut ~40% of roadside PM2.5)
 *    - auto (open-sided rickshaw):    1.3  (direct exposure to adjacent tailpipe plumes)
 *    - two_wheeler (bike/scooter):    1.3  (direct traffic exhaust + elevated breathing rate)
 *    - walk (roadside footpath):      1.2  (higher minute ventilation along arterial roads)
 *    - metro (AC cabin, grade-sep):   0.5  (filtered cabin & elevated/underground separation)
 *
 * 3. CO2 Emissions (kg CO2 per passenger-km, India urban transport averages):
 *    - car:         0.17 kg/km
 *    - auto:        0.08 kg/km
 *    - two_wheeler: 0.05 kg/km
 *    - metro:       0.03 kg/km
 *    - walk:        0.00 kg/km
 */

import { PM25_HOURS_PER_CIGARETTE } from '../shared/constants';
import { logger } from './logger';

export { PM25_HOURS_PER_CIGARETTE };

export interface LatLon {
  lat: number;
  lon: number;
}

export type RouteMode = 'car' | 'auto' | 'two_wheeler' | 'walk' | 'metro';

export const MODE_EXPOSURE_FACTORS: Record<RouteMode, number> = {
  car: 0.6,
  auto: 1.3,
  two_wheeler: 1.3,
  walk: 1.2,
  metro: 0.5,
};

export const CO2_KG_PER_KM: Record<RouteMode, number> = {
  car: 0.17,
  auto: 0.08,
  two_wheeler: 0.05,
  metro: 0.03,
  walk: 0,
};

export const METRO_SPEED_KMH = 35;
export const METRO_WALK_MIN_DEFAULT = 12; // total walk to & from stations
export const RECOMMENDED_MAX_EXTRA_MINUTES = 15;
export const SMOG_TIE_THRESHOLD_CIGS = 0.02; // prefer lower CO2 if within 0.02 cigarettes

export interface RawRouteGeometry {
  id: string;
  mode: RouteMode;
  label: string;
  summary?: string;
  distanceKm: number;
  durationMin: number;
  path: LatLon[];
  isEstimate?: boolean;
  isAlternative?: boolean;
  transitUrl?: string;
}

export type ExposureLevel = 'clean' | 'moderate' | 'high';

export interface EvaluatedRouteOption extends RawRouteGeometry {
  avgPm25: number;
  cigarettes: number;
  co2Kg: number;
  exposureLevel: ExposureLevel;
  strokeColor: string;
  recommended: boolean;
  recommendedReason?: string;
  relativeSmogLabel: string;
  smogBarPercent: number;
}

export interface DepartureTip {
  bestTimeLabel: string;
  departureLabel: string;
  percentLessSmog: number;
  currentPm25: number;
  bestPm25: number;
  message: string;
}

/**
 * Great-circle Haversine distance in kilometers.
 */
export function haversineDistanceKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Evenly samples `count` points (default 5) along a route polyline by cumulative distance.
 */
export function sampleRoutePoints(path: LatLon[], count = 5): LatLon[] {
  if (!path || path.length === 0 || count <= 0) return [];
  if (path.length === 1 || count === 1) {
    return [{ lat: path[0].lat, lon: path[0].lon }];
  }

  // Compute cumulative distance along polyline
  const cumDist: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineDistanceKm(path[i - 1], path[i]));
  }
  const totalDist = cumDist[cumDist.length - 1];

  // If all points are identical, repeat start point
  if (totalDist <= 1e-6) {
    return Array.from({ length: count }, () => ({
      lat: Number(path[0].lat.toFixed(5)),
      lon: Number(path[0].lon.toFixed(5)),
    }));
  }

  const sampled: LatLon[] = [];
  for (let s = 0; s < count; s++) {
    const targetDist = (totalDist * s) / (count - 1);

    // Find segment containing targetDist
    let segIdx = 0;
    while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < targetDist) {
      segIdx++;
    }

    const segStart = cumDist[segIdx];
    const segEnd = cumDist[segIdx + 1];
    const segLen = segEnd - segStart;
    const t = segLen > 1e-9 ? Math.max(0, Math.min(1, (targetDist - segStart) / segLen)) : 0;

    const p0 = path[segIdx];
    const p1 = path[segIdx + 1];
    sampled.push({
      lat: Number((p0.lat + (p1.lat - p0.lat) * t).toFixed(5)),
      lon: Number((p0.lon + (p1.lon - p0.lon) * t).toFixed(5)),
    });
  }

  return sampled;
}

/**
 * Builds a single Open-Meteo Air Quality batch URL for multiple coordinates using
 * comma-separated latitude & longitude parameters.
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
 * Fetches PM2.5 for all sampled points across routes in ONE Open-Meteo request
 * (comma-separated lat/lon). Returns an array of PM2.5 numbers aligned 1:1 with `points`.
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

    // Open-Meteo returns an array when >1 coordinate is requested, or a single object when 1 coordinate is requested
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

/**
 * Calculates cigarette-equivalent PM2.5 exposure for a single trip:
 * cigarettes = avgPM2.5 × travel_hours × mode_factor ÷ 528
 */
export function calculateRouteCigarettes(
  avgPm25: number,
  durationMin: number,
  mode: RouteMode,
): number {
  const safePm25 = Math.max(0, avgPm25 || 0);
  const travelHours = Math.max(0, durationMin || 0) / 60;
  const factor = MODE_EXPOSURE_FACTORS[mode] ?? 1.0;
  const cigs = (safePm25 * travelHours * factor) / PM25_HOURS_PER_CIGARETTE;
  return Number(cigs.toFixed(2));
}

/**
 * Calculates CO2 emissions in kg for a trip:
 * CO2 = distanceKm × CO2_KG_PER_KM[mode]
 */
export function calculateRouteCo2Kg(distanceKm: number, mode: RouteMode): number {
  const safeKm = Math.max(0, distanceKm || 0);
  const rate = CO2_KG_PER_KM[mode] ?? 0;
  return Number((safeKm * rate).toFixed(2));
}

/**
 * Builds the official Google Maps Transit deep link for Metro directions.
 */
export function buildGoogleTransitUrl(origin: LatLon, destination: LatLon): string {
  const orig = `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}`;
  const dest = `${destination.lat.toFixed(5)},${destination.lon.toFixed(5)}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(orig)}&destination=${encodeURIComponent(dest)}&travelmode=transit`;
}

/**
 * Estimates a Metro trip: walk to/from station + rail travel at 35 km/h (mode factor 0.5).
 */
export function estimateMetroRoute(
  origin: LatLon,
  destination: LatLon,
  referenceRoadKm?: number,
): RawRouteGeometry {
  const straightKm = haversineDistanceKm(origin, destination);
  const railDistanceKm = Number(
    Math.max(0.5, referenceRoadKm ? referenceRoadKm * 0.95 : straightKm * 1.2).toFixed(1),
  );

  // Walk to & from stations: ~12 min typical, reduced proportionally for very short trips
  const walkMin = railDistanceKm < 2 ? 6 : METRO_WALK_MIN_DEFAULT;
  const railMin = (railDistanceKm / METRO_SPEED_KMH) * 60;
  const totalMin = Math.max(8, Math.round(walkMin + railMin));

  // Build a gently arched 5-point line between origin and destination for map display
  const path: LatLon[] = [];
  const steps = 6;
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  // Slight perpendicular offset so metro line is visually distinguishable from road line
  const perpLat = -dLon * 0.08;
  const perpLon = dLat * 0.08;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const arch = Math.sin(t * Math.PI);
    path.push({
      lat: Number((origin.lat + dLat * t + perpLat * arch).toFixed(5)),
      lon: Number((origin.lon + dLon * t + perpLon * arch).toFixed(5)),
    });
  }

  return {
    id: 'metro_estimate',
    mode: 'metro',
    label: 'Metro',
    summary: `~${walkMin} min walk + rail at ${METRO_SPEED_KMH} km/h`,
    distanceKm: railDistanceKm,
    durationMin: totalMin,
    path,
    isEstimate: true,
    transitUrl: buildGoogleTransitUrl(origin, destination),
  };
}

export {
  selectRecommendedOption,
  classifyExposureColor,
  evaluateRouteOptions,
  computeDepartureTip,
} from './routeScoring';
export type { RecommendationResult } from './routeScoring';
