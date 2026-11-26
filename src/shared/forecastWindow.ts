/**
 * Pure, runtime-agnostic forecast types and best clean-air window calculation.
 * Safe to import from both browser code (Vite) and Node.js serverless functions (Vercel /api/*).
 * Contains NO browser globals, NO import.meta.env, and NO Supabase client imports.
 */

export interface ForecastDataPoint {
  isoTime: string; // e.g. "2026-11-20T14:00"
  timestamp: number; // epoch milliseconds
  time: string; // e.g. "2 PM"
  fullTime: string; // e.g. "2:00 PM"
  hour: number; // 0 - 23
  day: 'Today' | 'Tomorrow' | string;
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
 * Computes the best clean-air window.
 *
 * CRITICAL RULE:
 * Must search upcoming hours from `now` through the next 24 hours.
 * Never suggests a window that has already passed today.
 */
export function computeBestWindow(
  forecast: ForecastDataPoint[],
  fromDate: Date = new Date(),
): BestAirWindow {
  const fromTime = fromDate.getTime();
  const maxUpcomingTime = fromTime + 24 * 3600 * 1000;

  // Filter to upcoming hours only: from (now - 15m) up to +24 hours
  const upcoming = forecast.filter((p) => {
    return p.timestamp >= fromTime - 15 * 60 * 1000 && p.timestamp <= maxUpcomingTime;
  });

  if (upcoming.length < 2) {
    const defaultStart = fromDate.getHours() < 14 ? '2:00 PM' : 'Tomorrow 2:00 PM';
    const defaultEnd = fromDate.getHours() < 14 ? '4:00 PM' : 'Tomorrow 4:00 PM';
    return {
      startHour: 14,
      endHour: 16,
      startTime: '2:00 PM',
      endTime: '4:00 PM',
      dayLabel: fromDate.getHours() < 14 ? 'Today' : 'Tomorrow',
      label: `${defaultStart} – ${defaultEnd}`,
      shortLabel: fromDate.getHours() < 14 ? '2–4 PM' : 'Tmrw 2–4 PM',
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

  const sameDayAsNow = new Date(startPt.timestamp).toDateString() === fromDate.toDateString();
  const dayPrefix = sameDayAsNow ? '' : `${startPt.day} `;

  const label = `${dayPrefix}${startPt.fullTime} – ${endPt.fullTime}`;
  const shortLabel = `${dayPrefix}${startPt.time}–${endPt.time}`;
  const avgAqi = Math.round((startPt.usAqi + endPt.usAqi) / 2);

  return {
    startHour: startPt.hour,
    endHour: endPt.hour,
    startTime: startPt.fullTime,
    endTime: endPt.fullTime,
    dayLabel: startPt.day,
    label,
    shortLabel,
    chartStart: startPt.time,
    chartEnd: endPt.time,
    avgPm25: Math.round(minAvg),
    avgAqi,
  };
}
