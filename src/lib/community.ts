/**
 * Shwas Community — Pure Join-Code, Weekly Savings Aggregation, Streak & Share Logic
 */

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

export const ALERT_TYPE_META: Record<
  AlertType,
  { label: string; shortLabel: string; badgeVariant: 'danger' | 'warning' | 'neutral' }
> = {
  garbage_burning: {
    label: 'Garbage burning',
    shortLabel: 'Garbage Burning',
    badgeVariant: 'danger',
  },
  construction_dust: {
    label: 'Construction dust',
    shortLabel: 'Construction Dust',
    badgeVariant: 'warning',
  },
  vehicle_smoke: {
    label: 'Vehicle smoke',
    shortLabel: 'Vehicle Smoke',
    badgeVariant: 'warning',
  },
  other: {
    label: 'Other smoke / odor',
    shortLabel: 'Local Alert',
    badgeVariant: 'neutral',
  },
};

// Unambiguous uppercase alphabet (omits 0/O and 1/I for easy sharing over WhatsApp)
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

/**
 * Generates a 6-character uppercase alphanumeric join code (e.g. "GP7K4M").
 */
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

/**
 * Normalizes a user-typed join code (trims, uppercases, removes spaces and dashes).
 */
export function normalizeJoinCode(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, JOIN_CODE_LENGTH);
}

/**
 * Validates that a normalized join code is exactly 6 uppercase alphanumeric characters.
 */
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

/**
 * Computes a member's consecutive active saving streak (days with cigarettes_saved > 0)
 * ending on todayStr (or yesterday if the user hasn't checked an item yet today).
 */
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

/**
 * Cleans up a member display name — removes accidental "My Family..." concatenation
 * from pre-filled inputs (e.g. "My FamilyRam Family" -> "Ram Family") and falls back cleanly.
 */
export function cleanDisplayName(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Family';
  const stripped = trimmed.replace(/^My Family(?=[A-Za-z0-9])/i, '').trim();
  return stripped || 'My Family';
}

/**
 * Aggregates weekly group cigarette savings (rolling 7 days ending today),
 * member count, per-member weekly & today totals, and streak flames.
 */
export function aggregateWeeklyCommunityStats(
  members: CommunityMember[],
  dailySavings: DailySavingRow[],
  today: Date = new Date(),
): WeeklyCommunityStats {
  const todayStr = toDayString(today);
  const weekStartStr = addDays(todayStr, -6); // inclusive 7-day window

  // Build map of userId -> displayName (including any user present in savings)
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
    ([userId, displayName]) => {
      const weeklySaved = Number((weeklyTotals.get(userId) || 0).toFixed(1));
      const todaySaved = Number((todayTotals.get(userId) || 0).toFixed(1));
      const streakDays = computeStreakDays(activeDaysByUser.get(userId) || [], todayStr);
      return {
        rank: 0,
        userId,
        displayName,
        weeklySaved,
        todaySaved,
        streakDays,
      };
    },
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

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

/**
 * Formats an ISO timestamp into a compact relative age string (e.g. "20 min ago").
 */
export function formatRelativeTime(
  isoTimestamp: string,
  now: Date = new Date(),
  t?: TranslateFn,
): string {
  const tr: TranslateFn =
    t ||
    ((_k, def, opts) =>
      opts ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : def);
  const ts = new Date(isoTimestamp).getTime();
  if (isNaN(ts)) return tr('community.timeJustNow', 'just now');

  const diffSec = Math.max(0, Math.floor((now.getTime() - ts) / 1000));
  if (diffSec < 60) return tr('community.timeJustNow', 'just now');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return tr('community.timeMinAgo', '{{count}} min ago', { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return tr('community.timeHrAgo', '{{count}} hr ago', { count: diffHr });
  const diffDays = Math.floor(diffHr / 24);
  return diffDays === 1
    ? tr('community.timeOneDayAgo', '1 day ago')
    : tr('community.timeDaysAgo', '{{count}} days ago', { count: diffDays });
}

/**
 * Formats a cigarette count cleanly (whole integers without .0, fractional with 1 decimal).
 */
export function formatSavedCount(val: number): string {
  const safe = Math.max(0, Number(val) || 0);
  const rounded = Number(safe.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Builds the share copy for Web Share API & WhatsApp fallback:
 * e.g. "We saved 4 cigarettes today 💨 #Shwas"
 */
export function buildShareText(cigarettesSavedToday: number, groupName?: string): string {
  const countStr = formatSavedCount(cigarettesSavedToday);
  const unit = countStr === '1' ? 'cigarette' : 'cigarettes';
  if (groupName) {
    return `We saved ${countStr} ${unit} today in ${groupName} 💨 #Shwas`;
  }
  return `We saved ${countStr} ${unit} today 💨 #Shwas`;
}

/**
 * Builds a WhatsApp share deep link for the fallback button.
 */
export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
