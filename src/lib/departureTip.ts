/**
 * Departure timing tip engine derived from the 48-hour air quality forecast.
 */

import type { ForecastDataPoint } from './forecast';
import type { DepartureTip } from './routeExposure';
import { formatClockTime } from './dateTimeFormat';

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

const defaultT: TranslateFn = (_k, def, opts) =>
  opts ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : def;

function format24hTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function findClosestForecastPoint(
  forecastPoints: ForecastDataPoint[],
  targetMs: number,
): ForecastDataPoint | null {
  let closest: ForecastDataPoint | null = null;
  let bestDiff = Infinity;

  for (const pt of forecastPoints) {
    const ptMs = new Date(pt.isoTime).getTime();
    if (isNaN(ptMs)) continue;
    const diff = Math.abs(ptMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = pt;
    }
  }
  return closest;
}

function findLowestUpcomingPoint(
  forecastPoints: ForecastDataPoint[],
  minMs: number,
  maxMs: number,
): ForecastDataPoint | null {
  let best: ForecastDataPoint | null = null;
  for (const pt of forecastPoints) {
    const ptMs = new Date(pt.isoTime).getTime();
    if (isNaN(ptMs) || ptMs < minMs || ptMs > maxMs) continue;
    if (!best || pt.pm25 < best.pm25) {
      best = pt;
    }
  }
  return best;
}

/**
 * Generates a departure timing tip from the 48-hour forecast:
 * e.g. "Leave at 2:00 PM instead of now to breathe 35% less smog"
 */
export function computeDepartureTip(
  forecastPoints: ForecastDataPoint[],
  departureTime: Date,
  isNow = true,
  t: TranslateFn = defaultT,
  language = 'en',
): DepartureTip | null {
  if (!forecastPoints || forecastPoints.length < 3) return null;

  const depMs = departureTime.getTime();
  const currentPoint = findClosestForecastPoint(forecastPoints, depMs);
  if (!currentPoint || currentPoint.pm25 <= 0) return null;

  const bestPoint = findLowestUpcomingPoint(
    forecastPoints,
    depMs + 45 * 60 * 1000,
    depMs + 18 * 3600 * 1000,
  );
  if (!bestPoint) return null;

  const reductionPct = Math.round(((currentPoint.pm25 - bestPoint.pm25) / currentPoint.pm25) * 100);
  if (reductionPct < 10) return null;

  const bestDate = new Date(bestPoint.isoTime);
  const hasValidBestDate = !isNaN(bestDate.getTime());
  const bestTimeLabel = hasValidBestDate ? formatClockTime(bestDate, language) : bestPoint.time;
  const bestTime24h = hasValidBestDate ? format24hTime(bestDate) : undefined;
  const departureLabel = isNow
    ? t('routes.now', 'now').toLowerCase()
    : formatClockTime(departureTime, language);

  return {
    bestTimeLabel,
    bestTime24h,
    departureLabel,
    percentLessSmog: reductionPct,
    currentPm25: currentPoint.pm25,
    bestPm25: bestPoint.pm25,
    message: t(
      'routes.tipMessage',
      'Leave at {{bestTime}} instead of {{departure}} to breathe {{percent}}% less smog',
      { bestTime: bestTimeLabel, departure: departureLabel, percent: reductionPct },
    ),
  };
}
