/**
 * Shwas Clean Routes — Exposure, Geometry & CO2 Engine
 *
 * All health exposure, cigarette equivalence, CO2 emissions, and route
 * recommendations are computed strictly in deterministic code (never LLM).
 */

import { PM25_HOURS_PER_CIGARETTE } from '@shared/constants';
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
export const METRO_WALK_MIN_DEFAULT = 12;
export const RECOMMENDED_MAX_EXTRA_MINUTES = 15;
export const SMOG_TIE_THRESHOLD_CIGS = 0.02;

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
  bestTime24h?: string;
  departureLabel: string;
  percentLessSmog: number;
  currentPm25: number;
  bestPm25: number;
  message: string;
}

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

export function sampleRoutePoints(path: LatLon[], count = 5): LatLon[] {
  if (!path || path.length === 0 || count <= 0) return [];
  if (path.length === 1 || count === 1) {
    return [{ lat: path[0].lat, lon: path[0].lon }];
  }

  const cumDist: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineDistanceKm(path[i - 1], path[i]));
  }
  const totalDist = cumDist[cumDist.length - 1];

  if (totalDist <= 1e-6) {
    return Array.from({ length: count }, () => ({
      lat: Number(path[0].lat.toFixed(5)),
      lon: Number(path[0].lon.toFixed(5)),
    }));
  }

  const sampled: LatLon[] = [];
  for (let s = 0; s < count; s++) {
    const targetDist = (totalDist * s) / (count - 1);
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

export function calculateRouteCigarettes(
  avgPm25: number,
  durationMin: number,
  mode: RouteMode,
): number {
  const safePm25 = Math.max(0, avgPm25 || 0);
  const travelHours = Math.max(0, durationMin || 0) / 60;
  const factor = MODE_EXPOSURE_FACTORS[mode] ?? 1.0;
  return Number(((safePm25 * travelHours * factor) / PM25_HOURS_PER_CIGARETTE).toFixed(2));
}

export function calculateRouteCo2Kg(distanceKm: number, mode: RouteMode): number {
  const safeKm = Math.max(0, distanceKm || 0);
  const rate = CO2_KG_PER_KM[mode] ?? 0;
  return Number((safeKm * rate).toFixed(2));
}

export function buildGoogleTransitUrl(origin: LatLon, destination: LatLon): string {
  const orig = `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}`;
  const dest = `${destination.lat.toFixed(5)},${destination.lon.toFixed(5)}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(orig)}&destination=${encodeURIComponent(dest)}&travelmode=transit`;
}

export function estimateMetroRoute(
  origin: LatLon,
  destination: LatLon,
  referenceRoadKm?: number,
): RawRouteGeometry {
  const straightKm = haversineDistanceKm(origin, destination);
  const railDistanceKm = Number(
    Math.max(0.5, referenceRoadKm ? referenceRoadKm * 0.95 : straightKm * 1.2).toFixed(1),
  );
  const walkMin = railDistanceKm < 2 ? 6 : METRO_WALK_MIN_DEFAULT;
  const totalMin = Math.max(8, Math.round(walkMin + (railDistanceKm / METRO_SPEED_KMH) * 60));

  const path: LatLon[] = [];
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  const perpLat = -dLon * 0.08;
  const perpLon = dLat * 0.08;

  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
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

export { buildOpenMeteoBatchUrl, extractPm25ForTime, fetchRoutePointsPm25 } from './routePm25';
export {
  selectRecommendedOption,
  classifyExposureColor,
  evaluateRouteOptions,
  computeDepartureTip,
} from './routeScoring';
export type { RecommendationResult } from './routeScoring';
