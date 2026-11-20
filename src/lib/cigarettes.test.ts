import { describe, it, expect } from 'vitest';
import {
  cigarettesForDay,
  estimateIndoorPm25,
  savingFromAction,
  ExposureSegment,
  HomeCharacteristics,
} from './cigarettes';

describe('Shwas Cigarette Engine', () => {
  it('correctly calculates 24h outdoor at 22 µg/m³ as exactly 1 cigarette', () => {
    const segments: ExposureSegment[] = [
      { place: 'Outdoor', hours: 24, pm25: 22 },
    ];
    const cigs = cigarettesForDay(segments);
    expect(cigs).toBe(1.0);
  });

  it('matches the README Delhi winter day benchmark (≈ 9 cigarettes)', () => {
    // README specification:
    // Outside (commute, market): 2h @ 300 µg/m³ -> 1.1 cigs
    // School / office: 8h @ 200 µg/m³ -> 3.0 cigs
    // Home, windows open: 14h @ 180 µg/m³ -> 4.8 cigs
    // Total ≈ 8.94 (≈ 9 cigarettes)
    const delhiDay: ExposureSegment[] = [
      { place: 'Outside (commute, market)', hours: 2, pm25: 300 },
      { place: 'School / office', hours: 8, pm25: 200 },
      { place: 'Home, windows open', hours: 14, pm25: 180 },
    ];

    const totalCigs = cigarettesForDay(delhiDay);
    // Exact: (600 + 1600 + 2520) / 528 = 4720 / 528 = 8.939...
    expect(totalCigs).toBeCloseTo(8.94, 1);
    expect(Math.round(totalCigs)).toBe(9);
  });

  it('computes savings from action (e.g. 9 → 5 saves 4 cigarettes)', () => {
    const before = 8.94;
    const after = 5.0;
    const saved = savingFromAction(before, after);
    expect(saved).toBeCloseTo(3.94, 1);
    expect(Math.round(saved)).toBe(4);
  });

  it('handles empty segments or zero hours safely', () => {
    expect(cigarettesForDay([])).toBe(0);
    expect(cigarettesForDay([{ place: 'Room', hours: 0, pm25: 300 }])).toBe(0);
  });

  describe('estimateIndoorPm25', () => {
    const baseHome: HomeCharacteristics = {
      windowsFacingRoad: false,
      purifier: false,
      chimney: false,
      cookingFuel: 'lpg',
      windowsShut: false,
    };

    it('shows windows shut significantly reduces indoor PM2.5', () => {
      const openIndoor = estimateIndoorPm25(300, { ...baseHome, windowsShut: false });
      const shutIndoor = estimateIndoorPm25(300, { ...baseHome, windowsShut: true });

      // Open: 300 * 0.75 + 15 = 240
      // Shut: 300 * 0.45 + 15 = 150
      expect(shutIndoor).toBeLessThan(openIndoor);
      expect(openIndoor).toBe(240);
      expect(shutIndoor).toBe(150);
    });

    it('shows air purifier dramatically purifies indoor air (e.g. down to ~60 µg/m³)', () => {
      const withPurifierAndShutWindows = estimateIndoorPm25(300, {
        windowsFacingRoad: false,
        purifier: true,
        chimney: true,
        cookingFuel: 'lpg',
        windowsShut: true,
      });

      // (300 * 0.45 + 15 * 0.3) * 0.40 = (135 + 4.5) * 0.40 = 55.8 µg/m³ ≈ 56 µg/m³
      expect(withPurifierAndShutWindows).toBeCloseTo(55.8, 1);
      expect(withPurifierAndShutWindows).toBeLessThan(65);
    });

    it('applies penalty for road-facing windows', () => {
      const awayFromRoad = estimateIndoorPm25(200, { ...baseHome, windowsFacingRoad: false });
      const facingRoad = estimateIndoorPm25(200, { ...baseHome, windowsFacingRoad: true });

      expect(facingRoad).toBeGreaterThan(awayFromRoad);
    });

    it('reflects high emissions from wood cooking without chimney', () => {
      const woodNoChimney = estimateIndoorPm25(100, {
        ...baseHome,
        cookingFuel: 'wood',
        chimney: false,
      });
      const woodWithChimney = estimateIndoorPm25(100, {
        ...baseHome,
        cookingFuel: 'wood',
        chimney: true,
      });

      expect(woodNoChimney).toBeGreaterThan(woodWithChimney);
    });
  });
});
