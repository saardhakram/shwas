/**
 * Shwas Cigarette Engine
 *
 * Core scientific conversion:
 * Breathing air with 22 µg/m³ of PM2.5 for a full day (24 hours) ≈ smoking 1 cigarette
 * (Berkeley Earth estimate: https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/)
 */

import { ProfileFamilyMember, ProfileHome } from '../types';

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

export const PM25_PER_CIGARETTE_24H = 22;

/**
 * Calculates total cigarettes equivalent for a day across different location segments.
 *
 * Formula:
 * cigarettes_today = Σ over places ( PM2.5_at_place ÷ 22 × hours_at_place ÷ 24 )
 *                  = Σ over places ( (PM2.5_at_place × hours_at_place) ÷ 528 )
 *
 * @param segments Array of { place, hours, pm25 }
 * @returns Total cigarettes smoked equivalent (floating point number)
 */
export function cigarettesForDay(segments: ExposureSegment[]): number {
  if (!segments || segments.length === 0) return 0;

  const total = segments.reduce((sum, seg) => {
    const hours = Math.max(0, seg.hours || 0);
    const pm25 = Math.max(0, seg.pm25 || 0);
    const cigs = (pm25 * hours) / (PM25_PER_CIGARETTE_24H * 24);
    return sum + cigs;
  }, 0);

  return Number(total.toFixed(2));
}

/**
 * Estimates indoor PM2.5 level based on outdoor PM2.5 and home building / lifestyle factors.
 *
 * Physical & Empirical multipliers:
 * 1. Windows:
 *    - Open windows allow direct ambient infiltration (~75% of ambient PM2.5 enters indoors).
 *    - Windows shut with standard Indian seals cuts infiltration to ~45% of ambient PM2.5.
 * 2. Proximity to road:
 *    - Windows facing a main road receive heavy vehicular exhaust and road dust (+20% penalty).
 * 3. Air Purifier:
 *    - A running HEPA purifier actively filters particulate matter, reducing ambient indoor
 *      levels by ~60% (multiplier of 0.40).
 * 4. Cooking fuel emissions (internal source):
 *    - Solid wood / biomass fuel generates heavy unvented particulate spike (+70 µg/m³ baseline).
 *    - LPG generates moderate combustion particles (+15 µg/m³ baseline).
 *    - Electric (induction) generates minimal combustion particles (+4 µg/m³ baseline).
 * 5. Kitchen Chimney / Exhaust:
 *    - A functioning chimney extracts ~70% of cooking emissions at source (multiplier of 0.30 on cooking emissions).
 *    - Active purifier further filters residual cooking smoke.
 *
 * @param outdoorPm25 Ambient outdoor PM2.5 in µg/m³
 * @param home Home characteristics
 * @returns Estimated indoor PM2.5 in µg/m³
 */
export function estimateIndoorPm25(
  outdoorPm25: number,
  home: HomeCharacteristics
): number {
  const safeOutdoor = Math.max(0, outdoorPm25);

  // 1. Ambient infiltration base factor
  let infiltrationRate = home.windowsShut ? 0.45 : 0.75;

  // 2. Road penalty multiplier
  if (home.windowsFacingRoad) {
    infiltrationRate *= 1.20; // 20% higher particulate penetration from vehicular plume
  }

  // Baseline indoor PM2.5 infiltrated from outside
  let indoorAmbient = safeOutdoor * infiltrationRate;

  // 3. Internal cooking source emissions
  let cookingEmission = 15; // default LPG
  const fuel = (home.cookingFuel || '').toLowerCase();
  if (fuel === 'wood' || fuel === 'biomass') {
    cookingEmission = 70;
  } else if (fuel === 'electric' || fuel === 'induction') {
    cookingEmission = 4;
  } else if (fuel === 'lpg' || fuel === 'gas') {
    cookingEmission = 15;
  }

  // 4. Chimney extraction
  if (home.chimney) {
    cookingEmission *= 0.30; // 70% exhaust efficiency
  }

  // Combined preliminary indoor PM2.5
  let totalIndoor = indoorAmbient + cookingEmission;

  // 5. Air purifier filtration
  if (home.purifier) {
    totalIndoor *= 0.40; // 60% particulate clearance by HEPA filter
  }

  return Number(Math.max(0, totalIndoor).toFixed(1));
}

/**
 * Calculates cigarettes saved between a baseline exposure and an improved action.
 *
 * @param before Cigarette count before intervention
 * @param after Cigarette count after intervention
 * @returns Non-negative cigarettes saved
 */
export function savingFromAction(before: number, after: number): number {
  const diff = before - after;
  return Number(Math.max(0, diff).toFixed(2));
}

/**
 * Calculates a family member's real daily cigarette exposure using their specific
 * daily routine (hours outside, hours away at office/school, hours at home) and building factors.
 */
export function calculateMemberDailyCigarettes(
  member: ProfileFamilyMember,
  outdoorPm25: number,
  home: ProfileHome,
  awayPm25?: number
): number {
  const safeOutdoor = Math.max(0, outdoorPm25);
  const hoursOutside = Math.max(0, member.routine?.hoursOutside || 0);
  const hoursAway = Math.max(0, member.routine?.hoursAway || 0);
  const hoursHome = Math.max(0, 24 - hoursOutside - hoursAway);

  // School or office indoor air quality (typically ~55% of outdoor level if enclosed)
  const safeAwayPm25 = awayPm25 ?? Math.round(safeOutdoor * 0.55);

  // Home indoor air quality computed from home factors
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
 *
 * Used uniformly across the Onboarding reveal screen and the Today screen.
 * - When selectedMemberId === 'all' (or not specified): returns the per-person average exposure across all family members.
 * - When selectedMemberId matches a specific member: returns that member's exposure.
 */
export function calculateFamilyExposure(
  family: ProfileFamilyMember[],
  outdoorPm25: number,
  home: ProfileHome,
  selectedMemberId: string = 'all'
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
 * Utility helper to format cigarette count for display (e.g. "8.9" or "9")
 */
export function formatCigarettes(cigs: number): string {
  if (cigs >= 10) {
    return Math.round(cigs).toString();
  }
  return cigs.toFixed(1);
}
