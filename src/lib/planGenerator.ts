/**
 * Shwas Daily Air Plan Generator
 *
 * Produces structured 6-8 action items tailored to the user's home, family health flags,
 * routine, and upcoming 24h air quality forecast.
 *
 * Used as:
 * 1. The guaranteed rule-based fallback when Gemini API is offline or returns invalid structure.
 * 2. The baseline for frontend savings calculations using savingFromAction.
 */

import type { RawPlanItem, AirPlanItem } from '../types/index.js';
export { generateRuleBasedPlan } from '../shared/planRules.js';

/**
 * Raw (unrounded) cigarettes saved by a single action based on its duration in hours:
 * saving = (before_pm25 - after_pm25) * hours / 528
 */
function rawPlanItemSavings(item: RawPlanItem, defaultHours = 2): number {
  const rawHours = Number(item.hours);
  const hours = Math.max(0.5, Number.isFinite(rawHours) && rawHours > 0 ? rawHours : defaultHours);
  const before = Number(item.before_pm25);
  const after = Number(item.after_pm25);
  const diff =
    Number.isFinite(before) && Number.isFinite(after) ? Math.max(0, before - after) : 0;
  return (diff * hours) / 528;
}

/**
 * Calculates cigarettes saved by a single action based on its duration in hours:
 * saving = (before_pm25 - after_pm25) * hours / 528
 *
 * Formula derivation:
 * 22 µg/m³ for 24h = 1 cigarette => 22 * 24 = 528 (µg·h/m³ per cigarette).
 * Avoided particulate dose = (before_pm25 - after_pm25) * hours.
 * Avoided cigarettes = (before_pm25 - after_pm25) * hours / 528.
 */
export function calculatePlanItemSavings(
  item: RawPlanItem,
  defaultHours = 2
): number {
  return Number(rawPlanItemSavings(item, defaultHours).toFixed(1));
}

/**
 * Converts RawPlanItems to interactive AirPlanItems with computed cigarette savings.
 *
 * When heroCigarettes is provided, item savings are scaled proportionally (using
 * largest-remainder rounding to 0.1 cigarettes) so their sum NEVER exceeds 70%
 * of heroCigarettes.
 */
export function buildEnrichedPlan(
  rawItems: RawPlanItem[],
  existingCompletedMap: Record<string, boolean> = {},
  heroCigarettes?: number
): AirPlanItem[] {
  const rawSavings = rawItems.map((item) => rawPlanItemSavings(item));
  const rawTotal = rawSavings.reduce((sum, val) => sum + val, 0);

  let finalTenths: number[];

  if (typeof heroCigarettes === 'number') {
    // Hard cap: sum of item savings <= 70% of heroCigarettes (floored to 0.1 so it never exceeds 70%)
    const capTenths =
      heroCigarettes > 0 ? Math.floor(heroCigarettes * 0.7 * 10 + 1e-9) : 0;

    if (capTenths <= 0 || rawItems.length === 0) {
      finalTenths = rawItems.map(() => 0);
    } else if (rawTotal <= 0 || rawTotal * 10 > capTenths) {
      // Scale proportionally (falling back to equal weights if items had missing/zero PM2.5 deltas)
      // and distribute tenths using largest-remainder method so savings are never 0 when items exist.
      const weights = rawTotal > 0 ? rawSavings : rawItems.map(() => 1);
      const weightSum = weights.reduce((s, v) => s + v, 0);
      const exactTenths = weights.map((v) => (v / weightSum) * capTenths);
      const floored = exactTenths.map((v) => Math.floor(v));
      const remaining = capTenths - floored.reduce((s, v) => s + v, 0);

      const indicesByRemainder = exactTenths
        .map((v, idx) => ({ idx, rem: v - floored[idx] }))
        .sort((a, b) => b.rem - a.rem);

      for (let i = 0; i < remaining && i < indicesByRemainder.length; i++) {
        floored[indicesByRemainder[i].idx] += 1;
      }
      finalTenths = floored;
    } else {
      // Unscaled tenths; if independent rounding pushes total above capTenths, trim smallest remainders
      const exactTenths = rawSavings.map((v) => v * 10);
      const rounded = exactTenths.map((v) => Math.round(v));
      let excess = rounded.reduce((s, v) => s + v, 0) - capTenths;
      if (excess > 0) {
        const candidates = exactTenths
          .map((v, idx) => ({ idx, overshoot: rounded[idx] - v }))
          .filter((c) => rounded[c.idx] > 0)
          .sort((a, b) => b.overshoot - a.overshoot);
        for (let i = 0; i < excess && i < candidates.length; i++) {
          rounded[candidates[i].idx] -= 1;
        }
      }
      // Guarantee non-zero total savings if all small items independently rounded down to 0
      if (rounded.reduce((s, v) => s + v, 0) === 0 && rawItems.length > 0) {
        let bestIdx = 0;
        for (let i = 1; i < exactTenths.length; i++) {
          if (exactTenths[i] > exactTenths[bestIdx]) bestIdx = i;
        }
        rounded[bestIdx] = 1;
      }
      finalTenths = rounded;
    }
  } else {
    finalTenths = rawSavings.map((v) => Math.round(v * 10));
  }

  return rawItems.map((item, index) => {
    const id = `plan_${index + 1}`;
    const cigarettesSaved = Number((finalTenths[index] / 10).toFixed(1));

    return {
      ...item,
      id,
      cigarettesSaved,
      completed: Boolean(existingCompletedMap[id]),
    };
  });
}

export interface CachedDailyPlan {
  source: string;
  items: RawPlanItem[];
  createdAt: string;
}

/**
 * Parses a cached daily plan from localStorage.
 * Gracefully migrates legacy plain-array entries to { source, items, createdAt }.
 */
export function parsePlanCache(raw: string | null): CachedDailyPlan | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return null;
      return {
        source: 'offline',
        items: parsed,
        createdAt: new Date().toISOString(),
      };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      return {
        source: typeof parsed.source === 'string' ? parsed.source : 'offline',
        items: parsed.items,
        createdAt:
          typeof parsed.createdAt === 'string'
            ? parsed.createdAt
            : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function serializePlanCache(source: string, items: RawPlanItem[]): string {
  const payload: CachedDailyPlan = {
    source,
    items,
    createdAt: new Date().toISOString(),
  };
  return JSON.stringify(payload);
}
