/**
 * Pure, runtime-agnostic forecast types and best clean-air window calculation.
 * Safe to import from both browser code (Vite) and Node.js serverless functions (Vercel /api/*).
 * Contains NO browser globals, NO import.meta.env, and NO Supabase client imports.
 */

export type ForecastDayKey = 'time.today' | 'time.tomorrow' | 'time.weekday';

export interface ForecastDataPoint {
  isoTime: string; // e.g. "2026-11-20T14:00"
  timestamp: number; // epoch milliseconds
  time: string; // e.g. "2 PM"
  fullTime: string; // e.g. "2:00 PM"
  hour: number; // 0 - 23
  day: ForecastDayKey | 'Today' | 'Tomorrow' | string;
  dayOffset?: number; // 0 = today, 1 = tomorrow, >= 2 = later weekday
  pm25: number; // raw PM2.5 in µg/m³
  usAqi: number; // Direct from Open-Meteo's us_aqi
  aqi: number; // alias for usAqi
  isPast: boolean;
}

export interface BestAirWindow {
  startHour: number;
  endHour: number;
  startTime: string;
  endTime: string;
  startTimestamp?: number;
  endTimestamp?: number;
  dayOffset: number;
  dayKey: ForecastDayKey;
  dayLabel: string;
  label: string;
  shortLabel: string;
  chartStart: string;
  chartEnd: string;
  avgPm25: number;
  avgAqi: number;
}

export function formatHourShort(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayH} ${period}`;
}

export function formatHourFull(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayH}:00 ${period}`;
}

/**
 * Computes calendar day offset between targetDate and referenceDate in local time:
 * 0 = same day, 1 = tomorrow, 2+ = subsequent days.
 */
export function computeLocalDayOffset(targetDate: Date, referenceDate: Date): number {
  const targetMidnight = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  ).getTime();
  const refMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  ).getTime();
  return Math.round((targetMidnight - refMidnight) / 86400000);
}

export function dayKeyFromOffset(dayOffset: number): ForecastDayKey {
  if (dayOffset <= 0) return 'time.today';
  if (dayOffset === 1) return 'time.tomorrow';
  return 'time.weekday';
}

function defaultDayLabelForOffset(dayOffset: number, rawDay?: string): string {
  if (dayOffset === 0) return 'Today';
  if (dayOffset === 1) return 'Tomorrow';
  if (rawDay && !rawDay.startsWith('time.')) return rawDay;
  return 'Tomorrow';
}

/**
 * Computes the best clean-air window across upcoming hours (now through next 24 hours).
 * Never suggests a window that has already passed today.
 */
export function computeBestWindow(
  forecast: ForecastDataPoint[],
  fromDate: Date = new Date(),
): BestAirWindow {
  const fromTime = fromDate.getTime();
  const maxUpcomingTime = fromTime + 24 * 3600 * 1000;

  const upcoming = forecast.filter((p) => {
    return p.timestamp >= fromTime - 15 * 60 * 1000 && p.timestamp <= maxUpcomingTime;
  });

  if (upcoming.length < 2) {
    const dayOffset = fromDate.getHours() < 14 ? 0 : 1;
    const dayKey = dayKeyFromOffset(dayOffset);
    const dayLabel = defaultDayLabelForOffset(dayOffset);
    const startDate = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate() + dayOffset,
      14,
      0,
      0,
      0,
    );
    const endDate = new Date(startDate.getTime() + 2 * 3600 * 1000);
    const defaultStart = dayOffset === 0 ? '2:00 PM' : 'Tomorrow 2:00 PM';
    const defaultEnd = dayOffset === 0 ? '4:00 PM' : 'Tomorrow 4:00 PM';
    return {
      startHour: 14,
      endHour: 16,
      startTime: '2:00 PM',
      endTime: '4:00 PM',
      startTimestamp: startDate.getTime(),
      endTimestamp: endDate.getTime(),
      dayOffset,
      dayKey,
      dayLabel,
      label: `${defaultStart} – ${defaultEnd}`,
      shortLabel: dayOffset === 0 ? '2–4 PM' : 'Tmrw 2–4 PM',
      chartStart: '2 PM',
      chartEnd: '4 PM',
      avgPm25: 120,
      avgAqi: 175,
    };
  }

  let minAvg = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < upcoming.length - 1; i++) {
    const avg = (upcoming[i].pm25 + upcoming[i + 1].pm25) / 2;
    if (avg < minAvg) {
      minAvg = avg;
      bestIdx = i;
    }
  }

  const startPt = upcoming[bestIdx];
  const endPt = upcoming[bestIdx + 1];

  const dayOffset = computeLocalDayOffset(new Date(startPt.timestamp), fromDate);
  const dayKey = dayKeyFromOffset(dayOffset);
  const dayLabel = defaultDayLabelForOffset(dayOffset, startPt.day);
  const dayPrefix = dayOffset === 0 ? '' : `${dayLabel} `;

  const label = `${dayPrefix}${startPt.fullTime} – ${endPt.fullTime}`;
  const shortLabel = `${dayPrefix}${startPt.time}–${endPt.time}`;
  const avgAqi = Math.round((startPt.usAqi + endPt.usAqi) / 2);

  return {
    startHour: startPt.hour,
    endHour: endPt.hour,
    startTime: startPt.fullTime,
    endTime: endPt.fullTime,
    startTimestamp: startPt.timestamp,
    endTimestamp: endPt.timestamp,
    dayOffset,
    dayKey,
    dayLabel,
    label,
    shortLabel,
    chartStart: startPt.time,
    chartEnd: endPt.time,
    avgPm25: Math.round(minAvg),
    avgAqi,
  };
}
