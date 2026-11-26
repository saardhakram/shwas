/**
 * Shwas Community — Pure Join-Code, Weekly Savings Aggregation & Streak Logic
 */

import { cleanDisplayName } from './communityFormatting';

export {
  ALERT_TYPE_META,
  buildShareText,
  buildWhatsAppShareUrl,
  cleanDisplayName,
  formatRelativeTime,
  formatSavedCount,
} from './communityFormatting';

export type AlertType = 'garbage_burning' | 'construction_dust' | 'vehicle_smoke' | 'other';

export interface CommunityGroup {
  id: string;
  name: string;
  join_code: string;
  created_by?: string;
  created_at?: string;
}

export interface CommunityMember {
  group_id: string;
  user_id: string;
  display_name: string;
  joined_at?: string;
}

export interface DailySavingRow {
  user_id: string;
  group_id: string;
  day: string; // YYYY-MM-DD
  cigarettes_saved: number;
}

export interface CommunityAlert {
  id: string;
  group_id: string;
  user_id: string;
  type: AlertType;
  message: string;
  lat?: number | null;
  lon?: number | null;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  weeklySaved: number;
  todaySaved: number;
  streakDays: number;
}

export interface WeeklyCommunityStats {
  totalWeeklySaved: number;
  memberCount: number;
  leaderboard: LeaderboardEntry[];
}

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(
  length = JOIN_CODE_LENGTH,
  randomFn: () => number = Math.random,
): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(randomFn() * JOIN_CODE_ALPHABET.length) % JOIN_CODE_ALPHABET.length;
    code += JOIN_CODE_ALPHABET[idx];
  }
  return code;
}

export function normalizeJoinCode(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, JOIN_CODE_LENGTH);
}

export function isValidJoinCode(raw: string): boolean {
  const normalized = normalizeJoinCode(raw);
  return (
    /^[A-Z0-9]{6}$/.test(normalized) && raw.trim().replace(/[\s-]/g, '').length === JOIN_CODE_LENGTH
  );
}

function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dayStr: string, delta: number): string {
  const dt = new Date(`${dayStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return toDayString(dt);
}

export function computeStreakDays(activeDays: string[], todayStr: string): number {
  const daySet = new Set(activeDays.filter(Boolean));
  if (daySet.size === 0) return 0;

  let cursor = daySet.has(todayStr) ? todayStr : addDays(todayStr, -1);
  if (!daySet.has(cursor)) return 0;

  let streak = 0;
  while (daySet.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function aggregateWeeklyCommunityStats(
  members: CommunityMember[],
  dailySavings: DailySavingRow[],
  today: Date = new Date(),
): WeeklyCommunityStats {
  const todayStr = toDayString(today);
  const weekStartStr = addDays(todayStr, -6);

  const memberMap = new Map<string, string>();
  for (const m of members) {
    memberMap.set(m.user_id, cleanDisplayName(m.display_name));
  }
  for (const row of dailySavings) {
    if (!memberMap.has(row.user_id)) {
      memberMap.set(row.user_id, 'Family');
    }
  }

  const weeklyTotals = new Map<string, number>();
  const todayTotals = new Map<string, number>();
  const activeDaysByUser = new Map<string, string[]>();

  for (const row of dailySavings) {
    const val = Math.max(0, Number(row.cigarettes_saved) || 0);
    if (val > 0) {
      const list = activeDaysByUser.get(row.user_id) || [];
      list.push(row.day);
      activeDaysByUser.set(row.user_id, list);
    }

    if (row.day >= weekStartStr && row.day <= todayStr) {
      weeklyTotals.set(row.user_id, (weeklyTotals.get(row.user_id) || 0) + val);
    }
    if (row.day === todayStr) {
      todayTotals.set(row.user_id, (todayTotals.get(row.user_id) || 0) + val);
    }
  }

  const entries: LeaderboardEntry[] = Array.from(memberMap.entries()).map(
    ([userId, displayName]) => ({
      rank: 0,
      userId,
      displayName,
      weeklySaved: Number((weeklyTotals.get(userId) || 0).toFixed(1)),
      todaySaved: Number((todayTotals.get(userId) || 0).toFixed(1)),
      streakDays: computeStreakDays(activeDaysByUser.get(userId) || [], todayStr),
    }),
  );

  entries.sort((a, b) => {
    if (b.weeklySaved !== a.weeklySaved) return b.weeklySaved - a.weeklySaved;
    if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
    return a.displayName.localeCompare(b.displayName);
  });

  const ranked = entries.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  const totalWeeklySaved = Number(ranked.reduce((sum, e) => sum + e.weeklySaved, 0).toFixed(1));

  return {
    totalWeeklySaved,
    memberCount: ranked.length,
    leaderboard: ranked,
  };
}
