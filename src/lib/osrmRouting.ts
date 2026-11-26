/**
 * OpenStreetMap Nominatim place search, public OSRM routing, and offline route estimator.
 */

import { haversineDistanceKm, type LatLon, type RawRouteGeometry } from './routeExposure';
import type { NominatimSearchResult, OsrmResponse, OsrmRouteItem } from '../types/maps';
import type { PlaceSuggestion } from './routingService';
import { logger } from './logger';

export async function searchNominatimPlaces(
  query: string,
  near?: LatLon,
): Promise<PlaceSuggestion[]> {
  try {
    const viewbox = near
      ? `&viewbox=${(near.lon - 0.5).toFixed(3)},${(near.lat + 0.5).toFixed(3)},${(near.lon + 0.5).toFixed(3)},${(near.lat - 0.5).toFixed(3)}`
      : '';
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query,
    )}&countrycodes=in&limit=5${viewbox}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as NominatimSearchResult[]).map((item) => {
      const parts = String(item.display_name || query).split(',');
      return {
        name: parts[0]?.trim() || query,
        subtitle: parts.slice(1, 3).join(',').trim(),
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      };
    });
  } catch (err) {
    logger.warn('[routingService] Nominatim search failed:', err);
    return [];
  }
}

async function queryOsrmProfile(
  profile: 'driving' | 'foot',
  coordStr: string,
): Promise<OsrmRouteItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson&alternatives=true`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = (await res.json()) as OsrmResponse;
    return json?.code === 'Ok' && Array.isArray(json.routes) ? json.routes : [];
  } catch (err) {
    logger.warn(`[routingService] OSRM ${profile} request failed:`, err);
    return [];
  }
}

function osrmPathToLatLon(r: OsrmRouteItem, origin: LatLon, destination: LatLon): LatLon[] {
  return r.geometry?.coordinates
    ? r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))
    : [origin, destination];
}

function mapOsrmDriveRoutes(
  driveRoutes: OsrmRouteItem[],
  origin: LatLon,
  destination: LatLon,
): RawRouteGeometry[] {
  const results: RawRouteGeometry[] = driveRoutes.slice(0, 2).map((r, idx) => {
    const legSummary = r.legs?.[0]?.summary;
    const defaultSummary = idx === 0 ? 'Fastest driving route' : 'Alternate route';
    return {
      id: idx === 0 ? 'car_main' : `car_alt_${idx}`,
      mode: 'car',
      label: idx === 0 ? 'Car (AC / windows shut)' : `Car Alt ${idx}`,
      summary: legSummary ? `via ${legSummary}` : defaultSummary,
      distanceKm: Number(((r.distance || 0) / 1000).toFixed(1)),
      durationMin: Math.max(2, Math.round(((r.duration || 600) / 60) * 1.35)),
      path: osrmPathToLatLon(r, origin, destination),
      isAlternative: idx > 0,
    };
  });

  if (driveRoutes.length > 0) {
    const r = driveRoutes[0];
    const distKm = Number(((r.distance || 0) / 1000).toFixed(1));
    const carMin = Math.max(2, Math.round(((r.duration || 600) / 60) * 1.35));
    const path = osrmPathToLatLon(r, origin, destination);
    const legSummary = r.legs?.[0]?.summary;

    results.push(
      {
        id: 'two_wheeler_main',
        mode: 'two_wheeler',
        label: 'Two-wheeler',
        summary: legSummary ? `via ${legSummary}` : 'Direct traffic route',
        distanceKm: distKm,
        durationMin: Math.max(2, Math.round(carMin * 0.88)),
        path,
      },
      {
        id: 'auto_main',
        mode: 'auto',
        label: 'Auto-rickshaw',
        summary: legSummary ? `via ${legSummary}` : 'Open road route',
        distanceKm: distKm,
        durationMin: Math.max(3, Math.round(carMin * 1.05)),
        path,
      },
    );
  }

  return results;
}

function mapOsrmFootRoute(
  footRoutes: OsrmRouteItem[],
  origin: LatLon,
  destination: LatLon,
): RawRouteGeometry[] {
  if (footRoutes.length === 0) return [];
  const r = footRoutes[0];
  const distKm = Number(((r.distance || 0) / 1000).toFixed(1));
  return [
    {
      id: 'walk_main',
      mode: 'walk',
      label: 'Walk',
      summary: r.legs?.[0]?.summary ? `via ${r.legs[0].summary}` : 'Walking path',
      distanceKm: distKm,
      durationMin: Math.max(2, Math.round((distKm / 4.8) * 60)),
      path: osrmPathToLatLon(r, origin, destination),
    },
  ];
}

/**
 * Fallback router using public OSRM (router.project-osrm.org) with alternatives.
 */
export async function fetchOsrmRoutes(
  origin: LatLon,
  destination: LatLon,
): Promise<RawRouteGeometry[] | null> {
  const coordStr = `${origin.lon.toFixed(5)},${origin.lat.toFixed(5)};${destination.lon.toFixed(5)},${destination.lat.toFixed(5)}`;
  const [driveRoutes, footRoutes] = await Promise.all([
    queryOsrmProfile('driving', coordStr),
    queryOsrmProfile('foot', coordStr),
  ]);

  if (driveRoutes.length === 0 && footRoutes.length === 0) return null;

  return [
    ...mapOsrmDriveRoutes(driveRoutes, origin, destination),
    ...mapOsrmFootRoute(footRoutes, origin, destination),
  ];
}

/**
 * Offline geometric estimate when both Google Routes and OSRM are unreachable.
 */
export function buildOfflineFallbackRoutes(
  origin: LatLon,
  destination: LatLon,
): RawRouteGeometry[] {
  const straightKm = Math.max(0.6, haversineDistanceKm(origin, destination));
  const roadKm = Number((straightKm * 1.28).toFixed(1));
  const path: LatLon[] = [
    origin,
    {
      lat: (origin.lat + destination.lat) / 2 + 0.003,
      lon: (origin.lon + destination.lon) / 2 - 0.003,
    },
    destination,
  ];

  const carMin = Math.max(4, Math.round((roadKm / 24) * 60));
  return [
    {
      id: 'car_main',
      mode: 'car',
      label: 'Car (AC / windows shut)',
      summary: 'Estimated road route',
      distanceKm: roadKm,
      durationMin: carMin,
      path,
      isEstimate: true,
    },
    {
      id: 'two_wheeler_main',
      mode: 'two_wheeler',
      label: 'Two-wheeler',
      summary: 'Estimated road route',
      distanceKm: roadKm,
      durationMin: Math.max(3, Math.round(carMin * 0.88)),
      path,
      isEstimate: true,
    },
    {
      id: 'auto_main',
      mode: 'auto',
      label: 'Auto-rickshaw',
      summary: 'Estimated road route',
      distanceKm: roadKm,
      durationMin: Math.max(4, Math.round(carMin * 1.05)),
      path,
      isEstimate: true,
    },
    {
      id: 'walk_main',
      mode: 'walk',
      label: 'Walk',
      summary: 'Estimated walking path',
      distanceKm: Number((straightKm * 1.15).toFixed(1)),
      durationMin: Math.max(5, Math.round(((straightKm * 1.15) / 4.8) * 60)),
      path: [origin, destination],
      isEstimate: true,
    },
  ];
}
