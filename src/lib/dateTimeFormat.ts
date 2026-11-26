/**
 * Locale-aware date, day, and clock-time formatters backed by Intl.DateTimeFormat.
 * Keeps stored data formats unchanged while localising all UI display labels across
 * en-IN, hi-IN, te-IN, ta-IN, bn-IN, and mr-IN.
 */

import type { BestAirWindow, ForecastDataPoint } from '@shared/forecastWindow';

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

const LOCALE_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
};

const defaultT: TranslateFn = (_k, def) => def;

export function resolveIntlLocale(language?: string): string {
  const base = (language || 'en').split('-')[0].toLowerCase();
  return LOCALE_MAP[base] || 'en-IN';
}

function normalizeIntlSpacesAndMeridiem(formatted: string): string {
  return formatted.replace(/[\u202F\u00A0]/g, ' ').replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());
}

/**
 * Formats a Date or epoch timestamp as a localized 12-hour clock time (e.g. "2:00 PM" / "२:०० PM").
 */
export function formatClockTime(dateOrMs: Date | number, language?: string): string {
  const d = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
  if (isNaN(d.getTime())) return '';
  const locale = resolveIntlLocale(language);
  const formatted = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return normalizeIntlSpacesAndMeridiem(formatted);
}

/**
 * Formats an hour (0–23) or Date as a compact localized hour label (e.g. "2 PM" / "२ PM").
 */
export function formatShortHour(hourOrDate: number | Date, language?: string): string {
  const d = hourOrDate instanceof Date ? hourOrDate : new Date(2026, 0, 1, hourOrDate, 0, 0, 0);
  if (isNaN(d.getTime())) return '';
  const locale = resolveIntlLocale(language);
  const formatted = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    hour12: true,
  }).format(d);
  return normalizeIntlSpacesAndMeridiem(formatted);
}

function parseClockToken(token: string): { hour: number; minute: number | null } | null {
  const trimmed = token.trim();
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = match12[2] !== undefined ? parseInt(match12[2], 10) : null;
    const meridiem = match12[3].toUpperCase();
    if (hour < 1 || hour > 12 || (minute !== null && (minute < 0 || minute > 59))) return null;
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
  }

  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) {
    return { hour: parseInt(match24[1], 10), minute: parseInt(match24[2], 10) };
  }

  return null;
}

/**
 * Formats a stored chart axis hour string (e.g. "2 PM" or "14:00") using Intl.DateTimeFormat.
 */
export function formatShortHourFromLabel(label: string, language?: string): string {
  const parsed = parseClockToken(label);
  if (!parsed) return label;
  return formatShortHour(parsed.hour, language);
}

/**
 * Localizes stored plan time strings (e.g. "7:30 AM", "2:00 PM – 4:00 PM", "14:00")
 * while keeping stored data untouched and gracefully preserving pre-localized strings.
 */
export function formatStoredTimeText(
  rawTime: string,
  language?: string,
  t: TranslateFn = defaultT,
): string {
  if (!rawTime) return '';
  let text = rawTime
    .replace(/\bTomorrow\b/g, t('time.tomorrow', 'Tomorrow'))
    .replace(/\bToday\b/g, t('time.today', 'Today'));

  text = text.replace(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi, (m) => {
    const parsed = parseClockToken(m);
    if (!parsed) return m;
    if (parsed.minute === null) return formatShortHour(parsed.hour, language);
    return formatClockTime(new Date(2026, 0, 1, parsed.hour, parsed.minute, 0, 0), language);
  });

  return text;
}

/**
 * Translates a forecast data point's dayOffset / dayKey via i18n or Intl weekday short name.
 */
export function formatDayLabel(
  point: Pick<ForecastDataPoint, 'day' | 'dayOffset' | 'timestamp'>,
  language?: string,
  t: TranslateFn = defaultT,
): string {
  if (point.dayOffset === 0 || point.day === 'time.today' || point.day === 'Today') {
    return t('time.today', 'Today');
  }
  if (point.dayOffset === 1 || point.day === 'time.tomorrow' || point.day === 'Tomorrow') {
    return t('time.tomorrow', 'Tomorrow');
  }
  if (typeof point.timestamp === 'number' && !isNaN(point.timestamp)) {
    const locale = resolveIntlLocale(language);
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(point.timestamp));
  }
  return point.day || '';
}

/**
 * Formats the best clean-air window label (e.g. "రేపు 2:00 PM – 3:00 PM") using i18n + Intl.
 */
export function formatBestWindowLabel(
  bestWindow: BestAirWindow,
  language?: string,
  t: TranslateFn = defaultT,
): string {
  const startDate =
    typeof bestWindow.startTimestamp === 'number' && !isNaN(bestWindow.startTimestamp)
      ? new Date(bestWindow.startTimestamp)
      : new Date(2026, 0, 1, bestWindow.startHour, 0, 0, 0);
  const endDate =
    typeof bestWindow.endTimestamp === 'number' && !isNaN(bestWindow.endTimestamp)
      ? new Date(bestWindow.endTimestamp)
      : new Date(2026, 0, 1, bestWindow.endHour, 0, 0, 0);

  const startText = formatClockTime(startDate, language);
  const endText = formatClockTime(endDate, language);

  let dayPrefix = '';
  if (
    bestWindow.dayOffset === 1 ||
    bestWindow.dayKey === 'time.tomorrow' ||
    bestWindow.dayLabel === 'Tomorrow'
  ) {
    dayPrefix = `${t('time.tomorrow', 'Tomorrow')} `;
  } else if (bestWindow.dayOffset > 1 && typeof bestWindow.startTimestamp === 'number') {
    const locale = resolveIntlLocale(language);
    const wd = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(startDate);
    dayPrefix = `${wd} `;
  }

  return `${dayPrefix}${startText} – ${endText}`;
}
