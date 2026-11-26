import { describe, it, expect } from 'vitest';
import {
  FIXES_TABLE,
  computeFixImpact,
  computeScanResults,
  DetectedSource,
} from './fixes';
import { UserProfile } from '../types';

describe('fixes.ts (Shwas Scan Fixes & Cigarette Impact Engine)', () => {
  it('contains definitions for all specified pollution source IDs', () => {
    const requiredKeys = [
      'incense',
      'mosquito_coil',
      'gas_stove_no_chimney',
      'wood_or_coal_stove',
      'open_window_road',
      'candles',
      'smoking',
      'dust_carpet',
      'no_purifier',
      'cooler_no_filter',
      'burning_waste',
      'construction_dust',
      'other',
    ];

    for (const key of requiredKeys) {
      expect(FIXES_TABLE[key as keyof typeof FIXES_TABLE]).toBeDefined();
      expect(FIXES_TABLE[key as keyof typeof FIXES_TABLE].reductionPercent).toBeGreaterThan(0);
      expect(FIXES_TABLE[key as keyof typeof FIXES_TABLE].defaultFix).toBeTruthy();
    }
  });

  it('computes positive cigarette savings from source fix using outdoor PM2.5 and home profile', () => {
    const source: DetectedSource = {
      id: 'mosquito_coil',
      box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
    };

    const impact = computeFixImpact(
      source,
      250, // severe outdoor Delhi winter air
      {
        windowsFacingRoad: true,
        purifier: false,
        chimney: false,
        cookingFuel: 'lpg',
        commuteMode: 'metro',
        windowsShut: true,
      },
      14 // 14 hours at home
    );

    expect(impact.id).toBe('mosquito_coil');
    expect(impact.reductionPercent).toBe(45);
    expect(impact.beforePm25).toBeGreaterThan(impact.afterPm25);
    expect(impact.cigarettesSaved).toBeGreaterThan(0);
  });

  it('gracefully handles unknown source IDs by defaulting to "other"', () => {
    const source = {
      id: 'unregistered_hazard' as any,
      label: 'Random Smoke',
      box: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
    };

    const impact = computeFixImpact(source, 150);
    expect(impact.id).toBe('other');
    expect(impact.label).toBe('Random Smoke');
    expect(impact.reductionPercent).toBe(15);
  });

  it('computes total scan results across multiple detected sources', () => {
    const sources: DetectedSource[] = [
      { id: 'incense', box: { x: 0.1, y: 0.2, w: 0.2, h: 0.2 } },
      { id: 'gas_stove_no_chimney', box: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 } },
      { id: 'open_window_road', box: { x: 0.7, y: 0.1, w: 0.2, h: 0.4 } },
    ];

    const mockProfile: UserProfile = {
      language: 'en',
      location: { lat: 28.6, lon: 77.2, name: 'Delhi' },
      family: [
        {
          id: 'me',
          name: 'Me',
          age: 30,
          flags: {},
          routine: { hoursOutside: 2, hoursAway: 8 },
        },
      ],
      home: {
        windowsFacingRoad: true,
        purifier: false,
        chimney: false,
        cookingFuel: 'lpg',
        commuteMode: 'metro',
        windowsShut: true,
      },
    };

    const results = computeScanResults(sources, 280, mockProfile);
    expect(results.fixes.length).toBe(3);
    expect(results.totalCigarettesSaved).toBeGreaterThan(0);
    expect(results.fixes[0].id).toBe('incense');
    expect(results.fixes[1].id).toBe('gas_stove_no_chimney');
  });
});
