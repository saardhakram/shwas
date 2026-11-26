/**
 * Shwas Clean Routes — Scoring & Recommendation Engine
 */

import {
  CO2_KG_PER_KM,
  RECOMMENDED_MAX_EXTRA_MINUTES,
  SMOG_TIE_THRESHOLD_CIGS,
  calculateRouteCigarettes,
  calculateRouteCo2Kg,
  type EvaluatedRouteOption,
  type ExposureLevel,
  type RawRouteGeometry,
  type RouteMode,
} from './routeExposure';
export { computeDepartureTip } from './departureTip';

import type { TranslateFn } from '../types';

const defaultT: TranslateFn = (_k: string, def: string, opts?: Record<string, unknown>) =>
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
