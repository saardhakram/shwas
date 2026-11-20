import { describe, it, expect } from 'vitest';
import {
  cigarettesForDay,
  estimateIndoorPm25,
  savingFromAction,
  calculateMemberDailyCigarettes,
  ExposureSegment,
  HomeCharacteristics,
} from './cigarettes';
import { ProfileFamilyMember, ProfileHome } from '../types';

describe('Shwas Cigarette Engine', () => {
  it('correctly calculates 24h outdoor at 22 µg/m³ as exactly 1 cigarette', () => {
    const segments: ExposureSegment[] = [
      { place: 'Outdoor', hours: 24, pm25: 22 },
    ];
    const cigs = cigarettesForDay(segments);
    expect(cigs).toBe(1.0);
  });

  it('matches the README Delhi winter day benchmark (≈ 9 cigarettes)', () => {
    const delhiDay: ExposureSegment[] = [
      { place: 'Outside (commute, market)', hours: 2, pm25: 300 },
      { place: 'School / office', hours: 8, pm25: 200 },
      { place: 'Home, windows open', hours: 14, pm25: 180 },
    ];

    const totalCigs = cigarettesForDay(delhiDay);
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

  describe('calculateMemberDailyCigarettes', () => {
    const member: ProfileFamilyMember = {
      id: 'me',
      name: 'Me',
      age: 32,
      flags: {},
      routine: {
        hoursOutside: 2,
        hoursAway: 8,
        awayPlace: 'office',
      },
    };

    const home: ProfileHome = {
      windowsFacingRoad: false,
      purifier: true,
      chimney: true,
      cookingFuel: 'lpg',
      commuteMode: 'metro',
      windowsShut: true,
    };

    it('calculates full day routine exposure realistically', () => {
      const cigs = calculateMemberDailyCigarettes(member, 250, home);
      expect(cigs).toBeGreaterThan(0);
      // With purifier and filtered office, should be substantially cleaner than 24h at 250 µg/m³ (which is ~11.4 cigs)
      expect(cigs).toBeLessThan(8.0);
    });

    it('shows higher exposure for members with longer outdoor hours', () => {
      const outdoorWorker: ProfileFamilyMember = {
        ...member,
        routine: { hoursOutside: 6, hoursAway: 4 },
      };
      const cigsBase = calculateMemberDailyCigarettes(member, 250, home);
      const cigsOutdoor = calculateMemberDailyCigarettes(outdoorWorker, 250, home);

      expect(cigsOutdoor).toBeGreaterThan(cigsBase);
    });
  });
});
