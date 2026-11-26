import { describe, expect, it } from 'vitest';
import { buildSuggestionChips } from './askHelpers';

describe('buildSuggestionChips', () => {
  it('returns generic suggestions when family is empty', () => {
    const chips = buildSuggestionChips([]);
    expect(chips).toHaveLength(3);
    expect(chips[0]).toContain('Can I walk');
  });

  it('uses real senior and child names and ages from the profile', () => {
    const chips = buildSuggestionChips([
      {
        id: 'me',
        name: 'Me',
        age: 34,
        flags: {},
        routine: { hoursOutside: 2, hoursAway: 8 },
      },
      {
        id: 'g1',
        name: 'Nana',
        age: 69,
        flags: { heart: true },
        routine: { hoursOutside: 1, hoursAway: 0 },
      },
      {
        id: 'k1',
        name: 'Ananya',
        age: 9,
        flags: { asthma: true },
        routine: { hoursOutside: 1, hoursAway: 6 },
      },
    ]);

    expect(chips).toEqual([
      'Can Nana walk at 6 PM?',
      'Is it safe for Ananya to play outside?',
      'Best mask for Ananya (9 yrs)?',
    ]);
  });
});
