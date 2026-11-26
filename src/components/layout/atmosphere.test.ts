import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildFamilyChips, getAtmosphereGradient } from './atmosphere';
import type { UserProfile } from '../../types';

const mockT = ((_key: string, defaultVal?: string) => defaultVal ?? _key) as unknown as TFunction;

describe('atmosphere helpers', () => {
  it('classifies AQI thresholds into severe, veryPoor, poor, and good gradients', () => {
    expect(getAtmosphereGradient(350, mockT).label).toBe('Severe Smog');
    expect(getAtmosphereGradient(250, mockT).label).toBe('Very Poor');
    expect(getAtmosphereGradient(150, mockT).badgeVariant).toBe('warning');
    expect(getAtmosphereGradient(60, mockT).badgeVariant).toBe('mint');
  });

  it('builds family chips from real user profile with health tags', () => {
    const profile: UserProfile = {
      language: 'en',
      location: { lat: 28.61, lon: 77.2, name: 'Delhi NCR' },
      family: [
        {
          id: 'p1',
          name: 'Dadi',
          age: 74,
          flags: { heart: true },
          routine: { hoursOutside: 1, hoursAway: 0 },
        },
        {
          id: 'p2',
          name: 'Riya',
          age: 7,
          flags: { asthma: true },
          routine: { hoursOutside: 1, hoursAway: 6 },
        },
      ],
      home: {
        windowsFacingRoad: true,
        purifier: false,
        chimney: false,
        cookingFuel: 'lpg',
        commuteMode: 'metro',
      },
    };

    const chips = buildFamilyChips(profile, mockT);
    expect(chips[0].id).toBe('all');
    expect(chips[1]).toMatchObject({ id: 'p1', name: 'Dadi (74)', tagType: 'senior' });
    expect(chips[2]).toMatchObject({ id: 'p2', name: 'Riya (7)', tagType: 'asthma' });
  });

  it('falls back to default chips when profile has no family', () => {
    const chips = buildFamilyChips(null, mockT);
    expect(chips.length).toBe(4);
    expect(chips[0].id).toBe('all');
  });
});
