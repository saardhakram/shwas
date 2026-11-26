/**
 * Shwas Scan Fixes & Cigarette Impact Engine
 *
 * Scientific & Empirical Basis:
 * Indoor PM2.5 in Indian households is strongly driven by localized internal combustion
 * sources (incense, mosquito coils, unvented biomass/gas cooking, candles, smoking) and
 * infiltration of ambient vehicular/construction dust.
 *
 * Each pollution source is mapped to:
 * - standard label / fix advice
 * - estimated indoor PM2.5 reduction percentage when the fix is applied
 * - default recommendation category
 *
 * Citations / Multipliers:
 * - Incense sticks (agarbatti): Burning 1 stick/hr emits ~150-300 µg/m³ PM2.5 in closed room.
 *   Switching to dhoop-free or natural diffusers cuts indoor particulate spike by ~35%.
 * - Mosquito coils: Smoldering coil emits particulate equivalent to ~75-100 cigarettes (Liu et al.).
 *   Switching to liquid vaporizers or nets reduces localized indoor PM2.5 by ~45%.
 * - Gas stove without chimney: Unvented LPG combustion emits nitrogen dioxide and fine ultrafine particles.
 *   Adding kitchen exhaust/chimney or cross-ventilation cuts kitchen-to-living transfer by ~30%.
 * - Wood/coal chulha: Extreme baseline emissions (1000+ µg/m³ peak).
 *   Transitioning to induction or vented cookstove cuts baseline particulate load by ~60%.
 * - Open window facing road: Heavy traffic soot infiltration.
 *   Sealing window during peak traffic hours reduces ambient ingress by ~25%.
 * - Candles / paraffin: Soot-producing open flames. Extinguishing reduces particulates by ~15%.
 * - Smoking indoors: Environmental tobacco smoke (ETS).
 *   Banning indoor smoking cuts room PM2.5 by ~50%.
 * - Dust / heavy carpet: Resuspended coarse & fine dust. Vacuuming / damp-mopping cuts by ~15%.
 * - No air purifier: In high AQI environments, running HEPA air purifier cuts indoor PM2.5 by ~55%.
 * - Desert cooler without filter: Draws humid dusty air inside without filtration.
 *   Adding mesh or HEPA pre-filter cuts dust by ~20%.
 * - Burning waste / leaf fires outside: High dioxin & soot plume infiltration.
 *   Shutting balcony doors & reporting reduces spike by ~40%.
 * - Construction dust: Coarse and fine silica/cement dust infiltration.
 *   Damp cloth perimeter sealing reduces dust ingress by ~25%.
 */

import { ProfileHome, UserProfile } from '../types';
import { PM25_HOURS_PER_CIGARETTE } from '@shared/constants';
import { estimateIndoorPm25, savingFromAction } from './cigarettes';

export type PollutionSourceId =
  | 'incense'
  | 'mosquito_coil'
  | 'gas_stove_no_chimney'
  | 'wood_or_coal_stove'
  | 'open_window_road'
  | 'candles'
  | 'smoking'
  | 'dust_carpet'
  | 'no_purifier'
  | 'cooler_no_filter'
  | 'burning_waste'
  | 'construction_dust'
  | 'other';

export interface FixDefinition {
  id: PollutionSourceId;
  labelKey: string;
  defaultLabel: string;
  fixKey: string;
  defaultFix: string;
  whyKey: string;
  defaultWhy: string;
  reductionPercent: number; // e.g. 35 = 35% reduction in indoor PM2.5
  category: 'seal' | 'ventilate' | 'purify' | 'routine';
}

export const FIXES_TABLE: Record<PollutionSourceId, FixDefinition> = {
  incense: {
    id: 'incense',
    labelKey: 'fixes.incense.label',
    defaultLabel: 'Incense / Agarbatti Smoke',
    fixKey: 'fixes.incense.fix',
    defaultFix: 'Switch to reed diffusers or smokeless essential oils; ventilate during prayer.',
    whyKey: 'fixes.incense.why',
    defaultWhy:
      'A single incense stick emits particulate matter equivalent to several cigarettes in an enclosed room.',
    reductionPercent: 35,
    category: 'routine',
  },
  mosquito_coil: {
    id: 'mosquito_coil',
    labelKey: 'fixes.mosquito_coil.label',
    defaultLabel: 'Mosquito Coil Burning',
    fixKey: 'fixes.mosquito_coil.fix',
    defaultFix: 'Use window mosquito nets or liquid vaporizers instead of smoldering coils.',
    whyKey: 'fixes.mosquito_coil.why',
    defaultWhy:
      'Burning one mosquito coil overnight releases as much PM2.5 as 75 to 100 cigarettes.',
    reductionPercent: 45,
    category: 'routine',
  },
  gas_stove_no_chimney: {
    id: 'gas_stove_no_chimney',
    labelKey: 'fixes.gas_stove_no_chimney.label',
    defaultLabel: 'Unvented Gas Stove',
    fixKey: 'fixes.gas_stove_no_chimney.fix',
    defaultFix:
      'Turn on kitchen exhaust fan while cooking, or open window with door to living room shut.',
    whyKey: 'fixes.gas_stove_no_chimney.why',
    defaultWhy:
      'Unvented LPG cooking creates sharp spikes of PM2.5 and NO2 that spread into bedrooms.',
    reductionPercent: 30,
    category: 'ventilate',
  },
  wood_or_coal_stove: {
    id: 'wood_or_coal_stove',
    labelKey: 'fixes.wood_or_coal_stove.label',
    defaultLabel: 'Solid Biomass / Chulha Smoke',
    fixKey: 'fixes.wood_or_coal_stove.fix',
    defaultFix:
      'Transition to an electric induction plate or cook in an open, well-ventilated veranda.',
    whyKey: 'fixes.wood_or_coal_stove.why',
    defaultWhy:
      'Solid fuel combustion produces extreme hazardous particulate concentrations exceeding 1,000 µg/m³.',
    reductionPercent: 60,
    category: 'routine',
  },
  open_window_road: {
    id: 'open_window_road',
    labelKey: 'fixes.open_window_road.label',
    defaultLabel: 'Road-Facing Open Windows',
    fixKey: 'fixes.open_window_road.fix',
    defaultFix:
      'Keep road-facing windows closed during morning (7–11 AM) and evening (6–10 PM) rush hours.',
    whyKey: 'fixes.open_window_road.why',
    defaultWhy:
      'Vehicular exhaust and resuspended tire dust flow directly into roadside living rooms.',
    reductionPercent: 25,
    category: 'seal',
  },
  candles: {
    id: 'candles',
    labelKey: 'fixes.candles.label',
    defaultLabel: 'Paraffin Wax Candles / Diyas',
    fixKey: 'fixes.candles.fix',
    defaultFix: 'Trim candle wicks to 5mm to reduce soot, or switch to LED diyas / beeswax.',
    whyKey: 'fixes.candles.why',
    defaultWhy: 'Flickering petroleum paraffin flames release ultrafine black carbon soot indoors.',
    reductionPercent: 15,
    category: 'routine',
  },
  smoking: {
    id: 'smoking',
    labelKey: 'fixes.smoking.label',
    defaultLabel: 'Indoor Cigarette / Bidi Smoking',
    fixKey: 'fixes.smoking.fix',
    defaultFix: 'Institute a strict 100% smoke-free home rule; smoke exclusively outdoors.',
    whyKey: 'fixes.smoking.why',
    defaultWhy: 'Secondhand smoke settles into upholstery and raises particulate levels for hours.',
    reductionPercent: 50,
    category: 'routine',
  },
  dust_carpet: {
    id: 'dust_carpet',
    labelKey: 'fixes.dust_carpet.label',
    defaultLabel: 'Dusty Carpet / Unswept Upholstery',
    fixKey: 'fixes.dust_carpet.fix',
    defaultFix:
      'Damp-mop hard floors and use a vacuum with HEPA filtration rather than dry sweeping.',
    whyKey: 'fixes.dust_carpet.why',
    defaultWhy: 'Dry brooms stir settled fine dust back into the air where children inhale it.',
    reductionPercent: 15,
    category: 'routine',
  },
  no_purifier: {
    id: 'no_purifier',
    labelKey: 'fixes.no_purifier.label',
    defaultLabel: 'No Active Air Purifier',
    fixKey: 'fixes.no_purifier.fix',
    defaultFix: 'Run an air purifier with a genuine True HEPA (H13) filter in the primary bedroom.',
    whyKey: 'fixes.no_purifier.why',
    defaultWhy:
      'HEPA filters trap 99.97% of fine particles, drastically cutting overnight exposure.',
    reductionPercent: 55,
    category: 'purify',
  },
  cooler_no_filter: {
    id: 'cooler_no_filter',
    labelKey: 'fixes.cooler_no_filter.label',
    defaultLabel: 'Desert Cooler Without Filter',
    fixKey: 'fixes.cooler_no_filter.fix',
    defaultFix: 'Add a dust pre-filter mesh on air intake pads and clean cooler tank weekly.',
    whyKey: 'fixes.cooler_no_filter.why',
    defaultWhy:
      'Evaporative coolers suck in dirty ambient air directly without particulate filtration.',
    reductionPercent: 20,
    category: 'seal',
  },
  burning_waste: {
    id: 'burning_waste',
    labelKey: 'fixes.burning_waste.label',
    defaultLabel: 'Nearby Leaf / Waste Burning Plume',
    fixKey: 'fixes.burning_waste.fix',
    defaultFix:
      'Close all balcony doors immediately, seal gaps with wet towels, and report via 311 / municipal app.',
    whyKey: 'fixes.burning_waste.why',
    defaultWhy:
      'Plastic and garbage smoke contains toxic dioxins, furans, and dense toxic particulates.',
    reductionPercent: 40,
    category: 'seal',
  },
  construction_dust: {
    id: 'construction_dust',
    labelKey: 'fixes.construction_dust.label',
    defaultLabel: 'Construction / Demolition Ingress',
    fixKey: 'fixes.construction_dust.fix',
    defaultFix: 'Apply foam weatherstripping to exterior doors and keep balconies washed down.',
    whyKey: 'fixes.construction_dust.why',
    defaultWhy:
      'Silica and cement dust particles cause immediate airway inflammation and coughing.',
    reductionPercent: 25,
    category: 'seal',
  },
  other: {
    id: 'other',
    labelKey: 'fixes.other.label',
    defaultLabel: 'Unidentified Air Quality Concern',
    fixKey: 'fixes.other.fix',
    defaultFix:
      'Improve cross-ventilation during clean afternoon air windows and keep doors sealed during smog hours.',
    whyKey: 'fixes.other.why',
    defaultWhy:
      'Any localized particulate buildup degrades indoor breathing air over extended hours.',
    reductionPercent: 15,
    category: 'ventilate',
  },
};

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
 * Computes impact of a detected pollution source in code:
 * 1. Takes outdoor PM2.5 and user's profile home characteristics.
 * 2. Computes baseline estimated indoor PM2.5.
 * 3. Applies the source's empirical reduction percentage to derive post-fix indoor PM2.5.
 * 4. Computes daily cigarettes saved using savingFromAction (assuming average indoor exposure of ~14h).
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

  // Baseline indoor PM2.5
  const baselineIndoor = estimateIndoorPm25(outdoorPm25, {
    windowsFacingRoad: effectiveHome.windowsFacingRoad,
    purifier: effectiveHome.purifier,
    chimney: effectiveHome.chimney,
    cookingFuel: effectiveHome.cookingFuel,
    windowsShut: effectiveHome.windowsShut ?? true,
  });

  // Calculate post-fix indoor PM2.5
  const reductionFraction = def.reductionPercent / 100;
  const afterIndoor = Math.max(10, Math.round(baselineIndoor * (1 - reductionFraction)));

  // Cigarettes equivalent before and after fix for indoor exposure hours
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
 * Computes impact for all detected sources and total cumulative savings.
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

  // Cap total savings realistically to avoiding full baseline indoor exposure
  const rawTotalSavings = fixes.reduce((acc, f) => acc + f.cigarettesSaved, 0);
  const maxPossibleSaving = computeMaxIndoorSavings(outdoorPm25, home, indoorHours);
  const capped =
    maxPossibleSaving > 0 ? Math.min(rawTotalSavings, maxPossibleSaving) : rawTotalSavings;
  const totalCigarettesSaved = Number(capped.toFixed(1));

  return {
    fixes,
    totalCigarettesSaved,
  };
}
