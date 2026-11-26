import { describe, it, expect } from 'vitest';
import {
  generateJoinCode,
  normalizeJoinCode,
  isValidJoinCode,
  cleanDisplayName,
  computeStreakDays,
  aggregateWeeklyCommunityStats,
  formatRelativeTime,
  buildShareText,
  buildWhatsAppShareUrl,
  CommunityMember,
  DailySavingRow,
} from './community';

describe('community.ts (Join Codes, Weekly Savings Aggregation & Share Copy)', () => {
  describe('Join-code generation & validation', () => {
    it('generates a valid 6-character uppercase join code from unambiguous alphabet', () => {
      const code = generateJoinCode();
      expect(code).toHaveLength(6);
      expect(isValidJoinCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    });

    it('normalizes lowercase, whitespace, and dashes cleanly', () => {
      expect(normalizeJoinCode(' gp7-k4m ')).toBe('GP7K4M');
      expect(isValidJoinCode(' gp7-k4m ')).toBe(true);
      expect(isValidJoinCode('AB12')).toBe(false);
      expect(isValidJoinCode('ABCDEFG')).toBe(false);
    });
  });

  describe('Streak & Weekly Savings Aggregation', () => {
    it('computes consecutive daily streaks ending today or yesterday', () => {
      // Active today + past 3 days => 4-day streak
      expect(
        computeStreakDays(
          ['2026-11-26', '2026-11-25', '2026-11-24', '2026-11-23', '2026-11-20'],
          '2026-11-26'
        )
      ).toBe(4);

      // Not checked yet today, but active yesterday + day before => 2-day streak
      expect(computeStreakDays(['2026-11-25', '2026-11-24'], '2026-11-26')).toBe(2);

      // Last active 3 days ago => streak broken (0)
      expect(computeStreakDays(['2026-11-23', '2026-11-22'], '2026-11-26')).toBe(0);
    });

    it('aggregates rolling 7-day weekly savings, ignores older rows, and ranks leaderboard', () => {
      const today = new Date('2026-11-26T10:00:00Z');
      const members: CommunityMember[] = [
        { group_id: 'g1', user_id: 'u1', display_name: 'Sharma Family' },
        { group_id: 'g1', user_id: 'u2', display_name: 'Kapoor Family' },
        { group_id: 'g1', user_id: 'u3', display_name: 'Verma Family' },
      ];

      const savings: DailySavingRow[] = [
        // u1: 3.5 + 4.0 = 7.5 this week (2-day streak); old row 2026-11-10 excluded from weekly sum!
        { group_id: 'g1', user_id: 'u1', day: '2026-11-26', cigarettes_saved: 3.5 },
        { group_id: 'g1', user_id: 'u1', day: '2026-11-25', cigarettes_saved: 4.0 },
        { group_id: 'g1', user_id: 'u1', day: '2026-11-10', cigarettes_saved: 12.0 },
        // u2: 5.0 + 3.0 + 2.0 = 10.0 this week (3-day streak) -> should rank #1
        { group_id: 'g1', user_id: 'u2', day: '2026-11-26', cigarettes_saved: 5.0 },
        { group_id: 'g1', user_id: 'u2', day: '2026-11-25', cigarettes_saved: 3.0 },
        { group_id: 'g1', user_id: 'u2', day: '2026-11-24', cigarettes_saved: 2.0 },
      ];

      const stats = aggregateWeeklyCommunityStats(members, savings, today);
      expect(stats.memberCount).toBe(3);
      expect(stats.totalWeeklySaved).toBe(17.5);
      expect(stats.leaderboard[0].displayName).toBe('Kapoor Family');
      expect(stats.leaderboard[0].rank).toBe(1);
      expect(stats.leaderboard[0].weeklySaved).toBe(10);
      expect(stats.leaderboard[0].todaySaved).toBe(5);
      expect(stats.leaderboard[0].streakDays).toBe(3);

      expect(stats.leaderboard[1].displayName).toBe('Sharma Family');
      expect(stats.leaderboard[1].weeklySaved).toBe(7.5);
      expect(stats.leaderboard[1].streakDays).toBe(2);

      expect(stats.leaderboard[2].displayName).toBe('Verma Family');
      expect(stats.leaderboard[2].weeklySaved).toBe(0);
      expect(stats.leaderboard[2].streakDays).toBe(0);
    });
  });

  describe('Alerts relative time & Share copy', () => {
    it('formats relative alert timestamps cleanly', () => {
      const now = new Date('2026-11-26T12:00:00Z');
      expect(formatRelativeTime('2026-11-26T11:40:00Z', now)).toBe('20 min ago');
      expect(formatRelativeTime('2026-11-26T10:00:00Z', now)).toBe('2 hr ago');
      expect(formatRelativeTime('2026-11-25T12:00:00Z', now)).toBe('1 day ago');
    });

    it('cleans accidental My Family concatenation in display names', () => {
      expect(cleanDisplayName('My FamilyRam Family')).toBe('Ram Family');
      expect(cleanDisplayName('My Family')).toBe('My Family');
      expect(cleanDisplayName('  Sharma Family  ')).toBe('Sharma Family');
      expect(cleanDisplayName('')).toBe('Family');

      const stats = aggregateWeeklyCommunityStats(
        [{ group_id: 'g1', user_id: 'u1', display_name: 'My FamilyRam Family' }],
        [],
        new Date('2026-11-26T10:00:00Z')
      );
      expect(stats.leaderboard[0].displayName).toBe('Ram Family');
    });

    it('builds share message and WhatsApp deep link', () => {
      const msg = buildShareText(4.0);
      expect(msg).toBe('We saved 4 cigarettes today 💨 #Shwas');
      const waUrl = buildWhatsAppShareUrl(msg);
      expect(waUrl).toContain('https://wa.me/?text=');
      expect(waUrl).toContain(encodeURIComponent('#Shwas'));
    });
  });
});
