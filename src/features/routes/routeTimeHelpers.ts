import {
  evaluateRouteOptions,
  fetchRoutePointsPm25,
  sampleRoutePoints,
  type EvaluatedRouteOption,
} from '../../lib/routeExposure';
import type { TranslateFn } from '../../types';
import {
  fetchRoutesForTrip,
  type PlaceSuggestion,
  type RoutingProvider,
} from '../../lib/routingService';

export type DeparturePreset = 'now' | 'plus1h' | 'custom';

export function buildDepartureDate(
  preset: DeparturePreset,
  customTime: string,
  now: Date = new Date(),
): Date {
  if (preset === 'now') return now;
  if (preset === 'plus1h') return new Date(now.getTime() + 60 * 60 * 1000);

  const [hh, mm] = (customTime || '14:30').split(':').map((n) => parseInt(n, 10));
  const custom = new Date(now);
  if (!isNaN(hh) && !isNaN(mm)) {
    custom.setHours(hh, mm, 0, 0);
    if (custom.getTime() < now.getTime() - 5 * 60 * 1000) {
      custom.setDate(custom.getDate() + 1);
    }
  }
  return custom;
}

export function parseTipTimeTo24h(bestTimeLabel: string): string | null {
  const match = bestTimeLabel.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hh = parseInt(match[1], 10);
  const mm = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  return `${hh.toString().padStart(2, '0')}:${mm}`;
}

export async function fetchAndEvaluateRoutes(
  orig: PlaceSuggestion,
  dest: PlaceSuggestion,
  depDate: Date,
  providerMode: 'google' | 'leaflet',
  fallbackPm: number,
  t: TranslateFn,
): Promise<{ evaluated: EvaluatedRouteOption[]; provider: RoutingProvider }> {
  const { routes, provider } = await fetchRoutesForTrip(
    { lat: orig.lat, lon: orig.lon },
    { lat: dest.lat, lon: dest.lon },
    depDate,
    providerMode === 'google',
  );

  const sampledPerRoute = routes.map((r) => sampleRoutePoints(r.path, 5));
  const pm25Values = await fetchRoutePointsPm25(sampledPerRoute.flat(), depDate, fallbackPm);

  let offset = 0;
  const routeAvgPm25s = sampledPerRoute.map((pts) => {
    const slice = pm25Values.slice(offset, offset + pts.length);
    offset += pts.length;
    return slice.length === 0 ? fallbackPm : slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  return { evaluated: evaluateRouteOptions(routes, routeAvgPm25s, t), provider };
}
