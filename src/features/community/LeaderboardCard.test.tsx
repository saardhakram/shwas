// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { LeaderboardCard } from './LeaderboardCard';
import type { LeaderboardEntry } from '../../lib/community';

describe('LeaderboardCard component', () => {
  afterEach(() => cleanup());

  it('renders ranked families, highlights current user with YOU badge, and displays streaks', () => {
    const entries: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'u1',
        displayName: 'Sharma Family',
        weeklySaved: 18.5,
        todaySaved: 3.2,
        streakDays: 5,
      },
      {
        rank: 2,
        userId: 'u2',
        displayName: 'Verma Family',
        weeklySaved: 6.0,
        todaySaved: 0,
        streakDays: 0,
      },
    ];

    render(<LeaderboardCard leaderboard={entries} currentUserId="u1" />);

    expect(screen.getByText('Sharma Family')).toBeTruthy();
    expect(screen.getByText('YOU')).toBeTruthy();
    expect(screen.getByText('5d streak')).toBeTruthy();
    expect(screen.getByText('Start streak today')).toBeTruthy();
    expect(screen.getByText(/18\.5 cigs/i)).toBeTruthy();
  });
});
