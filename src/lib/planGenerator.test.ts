import { describe, it, expect } from 'vitest';
import {
  generateRuleBasedPlan,
  calculatePlanItemSavings,
  buildEnrichedPlan,
  computeTodayExposureSummary,
  parsePlanCache,
  serializePlanCache,
} from './planGenerator';
import { UserProfile, RawPlanItem } from '../types';

describe('Daily Air Plan Generator Engine', () => {
  const sampleProfile: UserProfile = {
    id: 'test-user',
    language: 'en',
    location: { lat: 28.6139, lon: 77.2090, name: 'Delhi NCR' },
    family: [
      {
        id: 'me',
        name: 'Me',
        age: 32,
        flags: {},
        routine: { hoursOutside: 2, hoursAway: 8, awayPlace: 'office' },
      },
      {
        id: 'child',
        name: 'Aarav',
        age: 8,
        flags: { asthma: true },
        routine: { hoursOutside: 1, hoursAway: 6, awayPlace: 'school' },
      },
    ],
    home: {
      windowsFacingRoad: true,
      purifier: true,
      chimney: true,
      cookingFuel: 'lpg',
      commuteMode: 'metro',
    },
  };

  it('generates between 6 and 8 actionable plan items with realistic hours', () => {
    const plan = generateRuleBasedPlan(sampleProfile);
    expect(plan.length).toBeGreaterThanOrEqual(6);
    expect(plan.length).toBeLessThanOrEqual(8);

    for (const item of plan) {
      expect(item.hours).toBeDefined();
      expect(item.hours).toBeGreaterThan(0);
    }
  });

  it('contains valid categories, times, and positive PM2.5 delta', () => {
    const plan = generateRuleBasedPlan(sampleProfile);

    for (const item of plan) {
      expect(item.time).toBeDefined();
      expect(item.action).toBeTruthy();
      expect(item.reason).toBeTruthy();
      expect(item.before_pm25).toBeGreaterThan(item.after_pm25);
    }
  });

  it('calculates savings via (before - after) * hours / 528 with 1 decimal place', () => {
    const item: RawPlanItem = {
      time: '8:00 AM',
      action: 'Shut road-facing windows',
      reason: 'Rush hour peak',
      category: 'seal',
      hours: 3,
      before_pm25: 300,
      after_pm25: 140,
    };

    // (300 - 140) * 3 / 528 = 160 * 3 / 528 = 480 / 528 = 0.9090... => 0.9
    const saved = calculatePlanItemSavings(item);
    expect(saved).toBe(0.9);
  });

  it('caps total plan savings at 70% of the hero number', () => {
    const items: RawPlanItem[] = [
      {
        time: '7:30 AM',
        action: 'Seal 1',
        reason: 'r1',
        category: 'seal',
        hours: 8,
        before_pm25: 400,
        after_pm25: 100, // (300 * 8) / 528 = 4.5
      },
      {
        time: '10:00 PM',
        action: 'Purifier 2',
        reason: 'r2',
        category: 'purify',
        hours: 8,
        before_pm25: 400,
        after_pm25: 100, // (300 * 8) / 528 = 4.5
      },
    ];

    const heroCigarettes = 1.2;
    const maxAllowedSavings = Math.floor(heroCigarettes * 0.7 * 10 + 1e-9) / 10; // 0.8
    const enriched = buildEnrichedPlan(items, {}, heroCigarettes);

    const totalSaved = Number(
      enriched.reduce((sum, it) => sum + it.cigarettesSaved, 0).toFixed(1)
    );
    expect(totalSaved).toBeLessThanOrEqual(maxAllowedSavings);
    expect(totalSaved).toBeLessThanOrEqual(heroCigarettes * 0.7);
  });

  it('proportionally scales 7 plan items when hero is 0.9 so sum never exceeds 70% (0.6) and target > 0', () => {
    const rawPlan = generateRuleBasedPlan(sampleProfile);
    expect(rawPlan.length).toBe(7);

    const hero = 0.9;
    const enriched = buildEnrichedPlan(rawPlan, {}, hero);
    const totalSaved = Number(
      enriched.reduce((sum, it) => sum + it.cigarettesSaved, 0).toFixed(1)
    );
    const target = Number((hero - totalSaved).toFixed(1));

    // 70% of 0.9 is 0.63 -> floored to 1 decimal place is 0.6
    expect(totalSaved).toBeLessThanOrEqual(hero * 0.7);
    expect(totalSaved).toBe(0.6);
    expect(target).toBe(0.3);
    expect(target).toBeGreaterThan(0);

    // Highest raw-impact item (8h overnight purifier) should get >= lowest-impact item (0.5h ventilate)
    const overnightPurifier = enriched[6];
    const shortVentilate = enriched[2];
    expect(overnightPurifier.cigarettesSaved).toBeGreaterThanOrEqual(
      shortVentilate.cigarettesSaved
    );
  });

  it('re-scales savings dynamically for different member hero exposures and zero hero', () => {
    const rawPlan = generateRuleBasedPlan(sampleProfile);

    // Very clean day / low-exposure member (hero = 0.4 -> 70% = 0.28 -> max 0.2)
    const lowEnriched = buildEnrichedPlan(rawPlan, {}, 0.4);
    const lowTotal = Number(
      lowEnriched.reduce((sum, it) => sum + it.cigarettesSaved, 0).toFixed(1)
    );
    expect(lowTotal).toBeLessThanOrEqual(0.4 * 0.7);
    expect(lowTotal).toBe(0.2);

    // Zero hero exposure -> zero savings
    const zeroEnriched = buildEnrichedPlan(rawPlan, {}, 0);
    const zeroTotal = zeroEnriched.reduce((sum, it) => sum + it.cigarettesSaved, 0);
    expect(zeroTotal).toBe(0);
  });

  it('builds enriched interactive plan with unique IDs and computed savings', () => {
    const rawPlan = generateRuleBasedPlan(sampleProfile);
    const enriched = buildEnrichedPlan(rawPlan, { plan_1: true });

    expect(enriched).toHaveLength(rawPlan.length);
    expect(enriched[0].completed).toBe(true);
    expect(enriched[1].completed).toBe(false);
    expect(enriched[0].cigarettesSaved).toBeGreaterThan(0);
  });

  it('supports Hindi language generation for action and reasons', () => {
    const hindiProfile: UserProfile = {
      ...sampleProfile,
      language: 'hi',
    };
    const plan = generateRuleBasedPlan(hindiProfile);
    expect(plan[0].action).toMatch(/[\u0900-\u097F]/); // contains Devanagari Hindi characters
  });

  it('serializes and parses daily plan cache preserving source and migrates legacy arrays', () => {
    const items = generateRuleBasedPlan(sampleProfile);

    // New { source, items, createdAt } format preserves 'gemini' source
    const serialized = serializePlanCache('gemini', items);
    const parsed = parsePlanCache(serialized);
    expect(parsed).not.toBeNull();
    expect(parsed!.source).toBe('gemini');
    expect(parsed!.items).toHaveLength(items.length);
    expect(parsed!.createdAt).toBeTruthy();

    // Legacy plain-array cache migrates gracefully to 'offline'
    const legacyParsed = parsePlanCache(JSON.stringify(items));
    expect(legacyParsed).not.toBeNull();
    expect(legacyParsed!.source).toBe('offline');
    expect(legacyParsed!.items).toHaveLength(items.length);
  });

  it('offline rule-based plan always produces positive savings (never X -> X) even on severe smog or malformed deltas', () => {
    // 1. Severe Delhi winter forecast where even the best window has high PM2.5 (260 µg/m³)
    const now = Date.now();
    const severeForecast = Array.from({ length: 24 }, (_, i) => ({
      isoTime: new Date(now + i * 3600 * 1000).toISOString(),
      timestamp: now + i * 3600 * 1000,
      time: `${(i % 12) || 12} ${i < 12 ? 'AM' : 'PM'}`,
      fullTime: `${(i % 12) || 12}:00 ${i < 12 ? 'AM' : 'PM'}`,
      hour: i,
      day: 'Today',
      pm25: 260,
      usAqi: 310,
      aqi: 310,
      isPast: false,
    }));

    const offlineItems = generateRuleBasedPlan(sampleProfile, severeForecast);
    for (const item of offlineItems) {
      expect(item.before_pm25).toBeGreaterThan(item.after_pm25);
    }

    const enriched = buildEnrichedPlan(offlineItems, {}, 0.9);
    const totalSaved = Number(
      enriched.reduce((sum, it) => sum + it.cigarettesSaved, 0).toFixed(1)
    );
    expect(totalSaved).toBeGreaterThan(0);
    expect(Number((0.9 - totalSaved).toFixed(1))).toBeLessThan(0.9);

    // 2. Even if cached/API items have equal or missing before/after PM2.5, savings are still > 0 for hero = 0.9
    const zeroDeltaItems: RawPlanItem[] = [
      { time: '8:00 AM', action: 'Shut windows', reason: 'Peak', category: 'seal', before_pm25: 100, after_pm25: 100 },
      { time: '2:00 PM', action: 'Air room', reason: 'Window', category: 'ventilate', before_pm25: 100, after_pm25: 100 },
    ];
    const fallbackEnriched = buildEnrichedPlan(zeroDeltaItems, {}, 0.9);
    const fallbackSaved = Number(
      fallbackEnriched.reduce((sum, it) => sum + it.cigarettesSaved, 0).toFixed(1)
    );
    expect(fallbackSaved).toBe(0.6);
    expect(fallbackSaved).toBeLessThanOrEqual(0.9 * 0.7);
  });

  it('uses the EXACT same base hero number across hero, pill (X -> Y), and badge (-S) for family average and individual members', () => {
    const rawPlan = generateRuleBasedPlan(sampleProfile);

    // Check across multiple realistic PM2.5 values and both "all" and specific member selections
    for (const pm25 of [95, 135, 180, 247, 320]) {
      for (const memberId of ['all', 'me', 'child']) {
        const summary = computeTodayExposureSummary(
          sampleProfile.family,
          pm25,
          sampleProfile.home,
          memberId,
          rawPlan,
          {}
        );

        // When no items are checked, hero display MUST equal pill start (heroCigarettes)
        expect(summary.currentCigarettes).toBe(summary.heroCigarettes);
        // Pill math MUST be exact to 1 decimal place: hero - badgeSavings === target
        expect(
          Number((summary.heroCigarettes - summary.totalPotentialSavings).toFixed(1))
        ).toBe(summary.targetCigarettes);
        // Badge savings must respect the 70% cap of the same heroCigarettes base
        expect(summary.totalPotentialSavings).toBeLessThanOrEqual(
          Number((summary.heroCigarettes * 0.7 + 1e-9).toFixed(2))
        );
        // Sum of item badges must equal totalPotentialSavings
        const itemSum = Number(
          summary.planItems.reduce((s, it) => s + it.cigarettesSaved, 0).toFixed(1)
        );
        expect(itemSum).toBe(summary.totalPotentialSavings);
      }
    }

    // Checking the first item lowers currentCigarettes by exactly that item's saving
    const checked = computeTodayExposureSummary(
      sampleProfile.family,
      135,
      sampleProfile.home,
      'all',
      rawPlan,
      { plan_1: true }
    );
    expect(checked.checkedSavings).toBe(checked.planItems[0].cigarettesSaved);
    expect(checked.currentCigarettes).toBe(
      Number(Math.max(checked.targetCigarettes, checked.heroCigarettes - checked.checkedSavings).toFixed(1))
    );
  });
});
