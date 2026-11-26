/**
 * Shwas Scan Fixes & Cigarette Impact Engine
 *
 * Computes deterministic indoor PM2.5 reductions and cigarette savings for
 * each detected room hazard using `FIXES_TABLE`.
 */

import type { ProfileHome, UserProfile } from '../types';
import { PM25_HOURS_PER_CIGARETTE } from '@shared/constants';
import { estimateIndoorPm25, savingFromAction } from './cigarettes';
import { FIXES_TABLE, type FixDefinition, type PollutionSourceId } from './fixesCatalog';

export { FIXES_TABLE };
export type { FixDefinition, PollutionSourceId };

export interface DetectedSource {
  id: PollutionSourceId;
  label?: string;
  box: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  confidence?: number;
}

export interface ComputedFix {
  id: PollutionSourceId;
  label: string;
  fix: string;
  why: string;
  reductionPercent: number;
  category: 'seal' | 'ventilate' | 'purify' | 'routine';
  beforePm25: number;
  afterPm25: number;
  cigarettesSaved: number;
  box: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/**
 * Computes deterministic cigarette savings for a single detected indoor source.
 */
export function computeFixImpact(
  source: DetectedSource,
  outdoorPm25: number,
  home?: ProfileHome | null,
  indoorHours = 14,
): ComputedFix {
  const normalizedId: PollutionSourceId = source.id in FIXES_TABLE ? source.id : 'other';
  const def = FIXES_TABLE[normalizedId];

  const effectiveHome: ProfileHome = home || {
    windowsFacingRoad: true,
    purifier: false,
    chimney: false,
    cookingFuel: 'lpg',
    commuteMode: 'metro',
    windowsShut: true,
  };

  const baselineIndoor = estimateIndoorPm25(outdoorPm25, {
    windowsFacingRoad: effectiveHome.windowsFacingRoad,
    purifier: effectiveHome.purifier,
    chimney: effectiveHome.chimney,
    cookingFuel: effectiveHome.cookingFuel,
    windowsShut: effectiveHome.windowsShut ?? true,
  });

  const reductionFraction = def.reductionPercent / 100;
  const afterIndoor = Math.max(10, Math.round(baselineIndoor * (1 - reductionFraction)));

  const beforeCigs = (baselineIndoor * indoorHours) / PM25_HOURS_PER_CIGARETTE;
  const afterCigs = (afterIndoor * indoorHours) / PM25_HOURS_PER_CIGARETTE;
  const cigsSaved = savingFromAction(beforeCigs, afterCigs);

  return {
    id: normalizedId,
    label: source.label || def.defaultLabel,
    fix: def.defaultFix,
    why: def.defaultWhy,
    reductionPercent: def.reductionPercent,
    category: def.category,
    beforePm25: Math.round(baselineIndoor),
    afterPm25: afterIndoor,
    cigarettesSaved: cigsSaved,
    box: source.box || { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  };
}

function resolveIndoorHours(profile?: UserProfile | null): number {
  const selfMember =
    profile?.family?.find((m) => m.id === 'me' || m.relation === 'self') || profile?.family?.[0];
  if (!selfMember) return 14;
  return Math.max(4, 24 - (selfMember.routine.hoursOutside + selfMember.routine.hoursAway));
}

function computeMaxIndoorSavings(
  outdoorPm25: number,
  home: ProfileHome | null,
  indoorHours: number,
): number {
  const baselineIndoor = estimateIndoorPm25(outdoorPm25, {
    windowsFacingRoad: home?.windowsFacingRoad ?? true,
    purifier: home?.purifier ?? false,
    chimney: home?.chimney ?? false,
    cookingFuel: home?.cookingFuel ?? 'lpg',
    windowsShut: home?.windowsShut ?? true,
  });
  const baselineIndoorCigs = (baselineIndoor * indoorHours) / PM25_HOURS_PER_CIGARETTE;
  const cleanTargetCigs = (15 * indoorHours) / PM25_HOURS_PER_CIGARETTE;
  return savingFromAction(baselineIndoorCigs, cleanTargetCigs);
}

/**
 * Computes impact for all detected sources and capped cumulative savings.
 */
export function computeScanResults(
  sources: DetectedSource[],
  outdoorPm25: number,
  profile?: UserProfile | null,
): {
  fixes: ComputedFix[];
  totalCigarettesSaved: number;
} {
  const home = profile?.home || null;
  const indoorHours = resolveIndoorHours(profile);
  const fixes = sources.map((s) => computeFixImpact(s, outdoorPm25, home, indoorHours));

  const rawTotalSavings = fixes.reduce((acc, f) => acc + f.cigarettesSaved, 0);
  const maxPossibleSaving = computeMaxIndoorSavings(outdoorPm25, home, indoorHours);
  const capped =
    maxPossibleSaving > 0 ? Math.min(rawTotalSavings, maxPossibleSaving) : rawTotalSavings;

  return {
    fixes,
    totalCigarettesSaved: Number(capped.toFixed(1)),
  };
}
