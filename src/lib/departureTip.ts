/**
 * Departure timing tip engine derived from the 48-hour air quality forecast.
 */

import type { ForecastDataPoint } from './forecast';
import type { DepartureTip } from './routeExposure';

type TranslateFn = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

const defaultT: TranslateFn = (_k, def, opts) =>
  opts ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : def;

function formatShortTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
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
  const bestTimeLabel = isNaN(bestDate.getTime()) ? bestPoint.time : formatShortTime(bestDate);
  const departureLabel = isNow
    ? t('routes.now', 'now').toLowerCase()
    : formatShortTime(departureTime);

  return {
    bestTimeLabel,
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
