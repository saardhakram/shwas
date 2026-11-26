/**
 * Display formatting, alert metadata, and share text helpers for Shwas Community.
 */

import type { AlertType } from './community';

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

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

export function cleanDisplayName(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Family';
  const stripped = trimmed.replace(/^My Family(?=[A-Za-z0-9])/i, '').trim();
  return stripped || 'My Family';
}

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

export function formatSavedCount(val: number): string {
  const safe = Math.max(0, Number(val) || 0);
  const rounded = Number(safe.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildShareText(cigarettesSavedToday: number, groupName?: string): string {
  const countStr = formatSavedCount(cigarettesSavedToday);
  const unit = countStr === '1' ? 'cigarette' : 'cigarettes';
  if (groupName) {
    return `We saved ${countStr} ${unit} today in ${groupName} 💨 #Shwas`;
  }
  return `We saved ${countStr} ${unit} today 💨 #Shwas`;
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
