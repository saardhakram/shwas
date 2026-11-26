/**
 * Shwas Clean Routes — Scoring, Recommendations & Departure Timing Engine
 *
 * Pure deterministic scoring functions used by routeExposure.ts.
 */

import type { ForecastDataPoint } from './forecast';
import {
  CO2_KG_PER_KM,
  RECOMMENDED_MAX_EXTRA_MINUTES,
  SMOG_TIE_THRESHOLD_CIGS,
  calculateRouteCigarettes,
  calculateRouteCo2Kg,
  type DepartureTip,
  type EvaluatedRouteOption,
  type ExposureLevel,
  type RawRouteGeometry,
  type RouteMode,
} from './routeExposure';

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

const defaultT: TranslateFn = (_k, def, opts) =>
  opts ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : def;

const SUSTAINABLE_MODES = new Set<RouteMode>(['metro', 'walk', 'two_wheeler']);

function getShortModeName(mode: RouteMode, t: TranslateFn = defaultT): string {
  switch (mode) {
    case 'metro':
      return t('routes.modeMetro', 'Metro');
    case 'car':
      return t('routes.modeCar', 'Car');
    case 'auto':
      return t('routes.modeAuto', 'Auto');
    case 'two_wheeler':
      return t('routes.modeTwoWheeler', 'Two-wheeler');
    case 'walk':
      return t('routes.modeWalk', 'Walk');
  }
}

export interface RecommendationResult {
  id: string;
  reason: string;
}

function getRecommendationReason(mode?: RouteMode, t: TranslateFn = defaultT): string {
  if (mode === 'walk') return t('routes.reasonWalk', 'cleanest for you · zero emissions');
  if (mode === 'metro') return t('routes.reasonMetro', 'cleanest for you and the city');
  if (mode === 'car') return t('routes.reasonCar', 'lowest personal smog exposure');
  if (mode === 'two_wheeler' || mode === 'auto')
    return t('routes.reasonTwoWheeler', 'cleanest & lower emissions');
  return t('routes.reasonMetro', 'cleanest for you and the city');
}

/**
 * Selects the "Recommended" option balancing personal smog exposure AND city sustainability:
 * 1. Only considers options within 15 minutes of the fastest option.
 * 2. If two options differ by less than 0.02 cigarettes, prefers the one with lower CO2.
 * 3. Never recommends Car when Metro, Walk, or Two-wheeler is within 0.02 cigarettes
 *    of the cleanest eligible option and within 15 minutes of the fastest option.
 */
export function selectRecommendedOption(
  options: Array<{
    id: string;
    mode?: RouteMode;
    durationMin: number;
    cigarettes: number;
    co2Kg?: number;
  }>,
  t: TranslateFn = defaultT,
): RecommendationResult | null {
  if (!options || options.length === 0) return null;

  const fastestMin = Math.min(...options.map((o) => o.durationMin));
  const eligible = options.filter(
    (o) => o.durationMin <= fastestMin + RECOMMENDED_MAX_EXTRA_MINUTES,
  );

  if (eligible.length === 0) {
    return { id: options[0].id, reason: t('routes.reasonFastest', 'fastest available option') };
  }

  const minCigs = Math.min(...eligible.map((o) => o.cigarettes));
  let candidates = eligible.filter((o) => o.cigarettes - minCigs <= SMOG_TIE_THRESHOLD_CIGS + 1e-9);

  const hasSustainableAlternative = candidates.some((c) => c.mode && SUSTAINABLE_MODES.has(c.mode));
  if (hasSustainableAlternative) {
    candidates = candidates.filter((c) => c.mode !== 'car');
  }

  candidates.sort((a, b) => {
    const co2A = a.co2Kg ?? (a.mode ? CO2_KG_PER_KM[a.mode] : 0);
    const co2B = b.co2Kg ?? (b.mode ? CO2_KG_PER_KM[b.mode] : 0);
    if (Math.abs(co2A - co2B) > 1e-6) return co2A - co2B;
    if (Math.abs(a.cigarettes - b.cigarettes) > 1e-6) return a.cigarettes - b.cigarettes;
    return a.durationMin - b.durationMin;
  });

  const winner = candidates[0];
  return { id: winner.id, reason: getRecommendationReason(winner.mode, t) };
}

/**
 * Maps an option's cigarette exposure relative to the set of options into a visual colour:
 * mint (#2DD4BF) cleanest -> amber (#F59E0B) moderate -> red (#EF4444) dirtiest.
 */
export function classifyExposureColor(
  cigarettes: number,
  minCigs: number,
  maxCigs: number,
): { exposureLevel: ExposureLevel; strokeColor: string } {
  const span = maxCigs - minCigs;
  if (span <= 0.01) {
    return cigarettes <= 0.25
      ? { exposureLevel: 'clean', strokeColor: '#2DD4BF' }
      : cigarettes <= 0.6
        ? { exposureLevel: 'moderate', strokeColor: '#F59E0B' }
        : { exposureLevel: 'high', strokeColor: '#EF4444' };
  }

  const ratio = (cigarettes - minCigs) / span;
  if (ratio <= 0.33) return { exposureLevel: 'clean', strokeColor: '#2DD4BF' };
  if (ratio <= 0.67) return { exposureLevel: 'moderate', strokeColor: '#F59E0B' };
  return { exposureLevel: 'high', strokeColor: '#EF4444' };
}

function formatMultiplier(ratio: number): string {
  if (ratio >= 9.95) return `${Math.round(ratio)}×`;
  const rounded = Number(ratio.toFixed(1));
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`;
}

function buildRelativeSmogLabel(
  isCleanest: boolean,
  cigarettes: number,
  minCigs: number,
  baselineName: string,
  t: TranslateFn = defaultT,
): string {
  if (isCleanest || cigarettes <= minCigs + 0.005) {
    return t('routes.relativeCleanest', 'Cleanest option');
  }
  if (minCigs <= 0) {
    return t('routes.relativeMore', 'More smog than {{mode}}', { mode: baselineName });
  }
  const ratio = cigarettes / minCigs;
  return ratio >= 1.15
    ? t('routes.relativeMultiplier', '{{mult}} more smog than {{mode}}', {
        mult: formatMultiplier(ratio),
        mode: baselineName,
      })
    : t('routes.relativeSimilar', 'Similar smog to {{mode}}', { mode: baselineName });
}

/**
 * Evaluates a batch of raw routes with their corresponding average PM2.5 values,
 * computes cigarettes, CO2, exposure colours, relative smog labels, bar widths,
 * and marks the Recommended option with its reason.
 */
export function evaluateRouteOptions(
  routes: RawRouteGeometry[],
  routeAvgPm25s: number[],
  t: TranslateFn = defaultT,
): EvaluatedRouteOption[] {
  if (!routes || routes.length === 0) return [];

  const preliminary = routes.map((route, idx) => {
    const avgPm25 = Math.round(routeAvgPm25s[idx] ?? 120);
    const cigarettes = calculateRouteCigarettes(avgPm25, route.durationMin, route.mode);
    const co2Kg = calculateRouteCo2Kg(route.distanceKm, route.mode);
    return { route, avgPm25, cigarettes, co2Kg };
  });

  const cigsList = preliminary.map((p) => p.cigarettes);
  const minCigs = Math.min(...cigsList);
  const maxCigs = Math.max(...cigsList);

  const cleanestBaseline = [...preliminary].sort((a, b) => {
    if (Math.abs(a.cigarettes - b.cigarettes) > 1e-6) return a.cigarettes - b.cigarettes;
    return a.co2Kg - b.co2Kg;
  })[0];
  const baselineName = getShortModeName(cleanestBaseline.route.mode, t);

  const recommendation = selectRecommendedOption(
    preliminary.map((p) => ({
      id: p.route.id,
      mode: p.route.mode,
      durationMin: p.route.durationMin,
      cigarettes: p.cigarettes,
      co2Kg: p.co2Kg,
    })),
    t,
  );

  return preliminary.map(({ route, avgPm25, cigarettes, co2Kg }) => {
    const { exposureLevel, strokeColor } = classifyExposureColor(cigarettes, minCigs, maxCigs);
    const relativeSmogLabel = buildRelativeSmogLabel(
      route.id === cleanestBaseline.route.id,
      cigarettes,
      minCigs,
      baselineName,
      t,
    );
    const smogBarPercent =
      maxCigs > 0 ? Math.max(8, Math.min(100, Math.round((cigarettes / maxCigs) * 100))) : 8;
    const isRec = recommendation?.id === route.id;

    return {
      ...route,
      avgPm25,
      cigarettes,
      co2Kg,
      exposureLevel,
      strokeColor,
      recommended: isRec,
      recommendedReason: isRec ? recommendation?.reason : undefined,
      relativeSmogLabel,
      smogBarPercent,
    };
  });
}

function formatShortTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function findClosestForecastPoint(
  forecastPoints: ForecastDataPoint[],
  targetMs: number,
): ForecastDataPoint | null {
  let closest: ForecastDataPoint | null = null;
  let bestDiff = Infinity;

  for (const pt of forecastPoints) {
    const ptMs = new Date(pt.isoTime).getTime();
    if (isNaN(ptMs)) continue;
    const diff = Math.abs(ptMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = pt;
    }
  }
  return closest;
}

function findLowestUpcomingPoint(
  forecastPoints: ForecastDataPoint[],
  minMs: number,
  maxMs: number,
): ForecastDataPoint | null {
  let best: ForecastDataPoint | null = null;
  for (const pt of forecastPoints) {
    const ptMs = new Date(pt.isoTime).getTime();
    if (isNaN(ptMs) || ptMs < minMs || ptMs > maxMs) continue;
    if (!best || pt.pm25 < best.pm25) {
      best = pt;
    }
  }
  return best;
}

/**
 * Generates a departure timing tip from the 48-hour forecast:
 * e.g. "Leave at 2:00 PM instead of now to breathe 35% less smog"
 */
export function computeDepartureTip(
  forecastPoints: ForecastDataPoint[],
  departureTime: Date,
  isNow = true,
  t: TranslateFn = defaultT,
): DepartureTip | null {
  if (!forecastPoints || forecastPoints.length < 3) return null;

  const depMs = departureTime.getTime();
  const currentPoint = findClosestForecastPoint(forecastPoints, depMs);
  if (!currentPoint || currentPoint.pm25 <= 0) return null;

  const bestPoint = findLowestUpcomingPoint(
    forecastPoints,
    depMs + 45 * 60 * 1000,
    depMs + 18 * 3600 * 1000,
  );
  if (!bestPoint) return null;

  const reductionPct = Math.round(((currentPoint.pm25 - bestPoint.pm25) / currentPoint.pm25) * 100);
  if (reductionPct < 10) return null;

  const bestDate = new Date(bestPoint.isoTime);
  const bestTimeLabel = isNaN(bestDate.getTime()) ? bestPoint.time : formatShortTime(bestDate);
  const departureLabel = isNow
    ? t('routes.now', 'now').toLowerCase()
    : formatShortTime(departureTime);

  return {
    bestTimeLabel,
    departureLabel,
    percentLessSmog: reductionPct,
    currentPm25: currentPoint.pm25,
    bestPm25: bestPoint.pm25,
    message: t(
      'routes.tipMessage',
      'Leave at {{bestTime}} instead of {{departure}} to breathe {{percent}}% less smog',
      { bestTime: bestTimeLabel, departure: departureLabel, percent: reductionPct },
    ),
  };
}
