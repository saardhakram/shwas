/**
 * Empirical indoor pollution source catalog and PM2.5 reduction percentages.
 */

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
  reductionPercent: number;
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
