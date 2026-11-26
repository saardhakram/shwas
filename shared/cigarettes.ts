/**
 * Shwas Cigarette Engine (runtime-agnostic)
 *
 * Core scientific conversion:
 * Breathing air with 22 µg/m³ of PM2.5 for a full day (24 hours) ≈ smoking 1 cigarette
 * (Berkeley Earth estimate: https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/)
 */

import type { ProfileFamilyMember, ProfileHome } from './types.js';
import { HOURS_PER_DAY, PM25_PER_CIGARETTE_24H } from './constants.js';

export { PM25_PER_CIGARETTE_24H };

export interface ExposureSegment {
  place: string;
  hours: number;
  pm25: number;
}

export interface HomeCharacteristics {
  windowsFacingRoad: boolean;
  purifier: boolean;
  chimney: boolean;
  cookingFuel: 'lpg' | 'wood' | 'electric' | string;
  windowsShut: boolean;
}

/**
 * Calculates total cigarettes equivalent for a day across different location segments.
 */
export function cigarettesForDay(segments: ExposureSegment[]): number {
  if (!segments || segments.length === 0) return 0;

  const total = segments.reduce((sum, seg) => {
    const hours = Math.max(0, seg.hours || 0);
    const pm25 = Math.max(0, seg.pm25 || 0);
    const cigs = (pm25 * hours) / (PM25_PER_CIGARETTE_24H * HOURS_PER_DAY);
    return sum + cigs;
  }, 0);

  return Number(total.toFixed(2));
}

/**
 * Estimates indoor PM2.5 level based on outdoor PM2.5 and home building / lifestyle factors.
 */
export function estimateIndoorPm25(outdoorPm25: number, home: HomeCharacteristics): number {
  const safeOutdoor = Math.max(0, outdoorPm25);
  let infiltrationRate = home.windowsShut ? 0.45 : 0.75;

  if (home.windowsFacingRoad) {
    infiltrationRate *= 1.2;
  }

  const indoorAmbient = safeOutdoor * infiltrationRate;

  let cookingEmission = 15; // default LPG
  const fuel = (home.cookingFuel || '').toLowerCase();
  if (fuel === 'wood' || fuel === 'biomass') {
    cookingEmission = 70;
  } else if (fuel === 'electric' || fuel === 'induction') {
    cookingEmission = 4;
  } else if (fuel === 'lpg' || fuel === 'gas') {
    cookingEmission = 15;
  }

  if (home.chimney) {
    cookingEmission *= 0.3;
  }

  let totalIndoor = indoorAmbient + cookingEmission;

  if (home.purifier) {
    totalIndoor *= 0.4;
  }

  return Number(Math.max(0, totalIndoor).toFixed(1));
}

/**
 * Calculates cigarettes saved between a baseline exposure and an improved action.
 */
export function savingFromAction(before: number, after: number): number {
  const diff = before - after;
  return Number(Math.max(0, diff).toFixed(2));
}

/**
 * Calculates a family member's real daily cigarette exposure using their specific
 * daily routine and building factors.
 */
export function calculateMemberDailyCigarettes(
  member: ProfileFamilyMember,
  outdoorPm25: number,
  home: ProfileHome,
  awayPm25?: number,
): number {
  const safeOutdoor = Math.max(0, outdoorPm25);
  const hoursOutside = Math.max(0, member.routine?.hoursOutside || 0);
  const hoursAway = Math.max(0, member.routine?.hoursAway || 0);
  const hoursHome = Math.max(0, 24 - hoursOutside - hoursAway);

  const safeAwayPm25 = awayPm25 ?? Math.round(safeOutdoor * 0.55);

  const indoorPm25 = estimateIndoorPm25(safeOutdoor, {
    windowsFacingRoad: Boolean(home.windowsFacingRoad),
    purifier: Boolean(home.purifier),
    chimney: Boolean(home.chimney),
    cookingFuel: home.cookingFuel || 'lpg',
    windowsShut: home.windowsShut ?? true,
  });

  const segments: ExposureSegment[] = [
    { place: 'Outdoors (commute/market)', hours: hoursOutside, pm25: safeOutdoor },
    { place: member.routine?.awayPlace || 'School/Office', hours: hoursAway, pm25: safeAwayPm25 },
    { place: 'Home', hours: hoursHome, pm25: indoorPm25 },
  ];

  return cigarettesForDay(segments);
}

/**
 * Single source of truth for family cigarette exposure calculations.
 */
export function calculateFamilyExposure(
  family: ProfileFamilyMember[],
  outdoorPm25: number,
  home: ProfileHome,
  selectedMemberId: string = 'all',
): {
  cigarettes: number;
  perPersonAverage: number;
  memberBreakdown: Array<{ id: string; name: string; age: number; cigarettes: number }>;
} {
  if (!family || family.length === 0) {
    return { cigarettes: 0, perPersonAverage: 0, memberBreakdown: [] };
  }

  const memberBreakdown = family.map((mem) => ({
    id: mem.id,
    name: mem.name,
    age: mem.age,
    cigarettes: calculateMemberDailyCigarettes(mem, outdoorPm25, home),
  }));

  const totalSum = memberBreakdown.reduce((sum, m) => sum + m.cigarettes, 0);
  const perPersonAverage = Number((totalSum / memberBreakdown.length).toFixed(1));

  let cigarettes = perPersonAverage;
  if (selectedMemberId !== 'all') {
    const specific = memberBreakdown.find((m) => m.id === selectedMemberId);
    if (specific) {
      cigarettes = specific.cigarettes;
    }
  }

  return {
    cigarettes,
    perPersonAverage,
    memberBreakdown,
  };
}

/**
 * Utility helper to format cigarette count for display (e.g. "8.9" or "9").
 */
export function formatCigarettes(cigs: number): string {
  if (cigs >= 10) {
    return Math.round(cigs).toString();
  }
  return cigs.toFixed(1);
}
