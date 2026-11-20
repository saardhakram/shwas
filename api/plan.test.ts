import { describe, it, expect } from 'vitest';
import { processPlanRequest } from './plan';
import { UserProfile } from '../src/types';

describe('Serverless Plan API (/api/plan)', () => {
  const profile: UserProfile = {
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
    ],
    home: {
      windowsFacingRoad: true,
      purifier: true,
      chimney: true,
      cookingFuel: 'lpg',
      commuteMode: 'metro',
    },
  };

  it('returns valid rule-based plan when no API key is provided', async () => {
    const res = await processPlanRequest({ profile }, undefined);
    expect(res).toBeDefined();
    expect(res.source).toBe('rule_based_no_key');
    expect(res.plan.length).toBeGreaterThanOrEqual(6);
    expect(res.plan[0]).toHaveProperty('time');
    expect(res.plan[0]).toHaveProperty('action');
    expect(res.plan[0]).toHaveProperty('before_pm25');
  });

  it('safely falls back to rule-based plan if Gemini API throws or fails', async () => {
    const res = await processPlanRequest({ profile }, 'invalid_key_for_testing');
    expect(res).toBeDefined();
    expect(res.plan.length).toBeGreaterThanOrEqual(6);
    expect(['rule_based_fallback', 'rule_based_api_error']).toContain(res.source);
  });
});
