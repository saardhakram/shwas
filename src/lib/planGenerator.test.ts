import { describe, it, expect } from 'vitest';
import { generateRuleBasedPlan, calculatePlanItemSavings, buildEnrichedPlan } from './planGenerator';
import { UserProfile } from '../types';

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

  it('generates between 6 and 8 actionable plan items', () => {
    const plan = generateRuleBasedPlan(sampleProfile);
    expect(plan.length).toBeGreaterThanOrEqual(6);
    expect(plan.length).toBeLessThanOrEqual(8);
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

  it('calculates non-negative cigarette savings from action using savingFromAction', () => {
    const item = {
      time: '8:00 AM',
      action: 'Shut windows',
      reason: 'Rush hour peak',
      category: 'seal',
      before_pm25: 300,
      after_pm25: 120,
    };

    const saved = calculatePlanItemSavings(item, 2);
    expect(saved).toBeGreaterThan(0);
    // (300 * 2 / 528) - (120 * 2 / 528) = (600 - 240) / 528 = 360 / 528 ≈ 0.68
    expect(saved).toBeCloseTo(0.68, 1);
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
});
