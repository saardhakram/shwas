/**
 * Google Maps JS Geocoder & Routes Library adapters.
 */

import type { LatLon, RawRouteGeometry } from './routeExposure';
import type { GoogleGeocoderResult, GoogleLatLngLike, GoogleRouteInstance } from '../types/maps';
import type { PlaceSuggestion } from './routingService';
import { logger } from './logger';

export async function searchGooglePlaces(
  query: string,
  near?: LatLon,
): Promise<PlaceSuggestion[] | null> {
  if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) return null;

  try {
    const geocoder = new window.google.maps.Geocoder();
    const LatLngBoundsCtor = window.google.maps.LatLngBounds;
    const response = await new Promise<GoogleGeocoderResult[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Google geocode timeout')), 4500);
      geocoder.geocode(
        {
          address: query,
          region: 'in',
          ...(near && LatLngBoundsCtor
            ? {
                bounds: new LatLngBoundsCtor(
                  { lat: near.lat - 0.3, lng: near.lon - 0.3 },
                  { lat: near.lat + 0.3, lng: near.lon + 0.3 },
                ),
              }
            : {}),
        },
        (results: GoogleGeocoderResult[] | null, status: string) => {
          clearTimeout(timeout);
          if (status === 'OK' && Array.isArray(results) && results.length > 0) {
            resolve(results);
          } else {
            reject(new Error(`Google geocode status: ${status}`));
          }
        },
      );
    });

    return response.slice(0, 5).map((r) => {
      const parts = String(r.formatted_address || query).split(',');
      return {
        name: parts[0]?.trim() || query,
        subtitle: parts.slice(1, 3).join(',').trim(),
        lat: r.geometry.location.lat(),
        lon: r.geometry.location.lng(),
      };
    });
  } catch (err) {
    logger.warn('[routingService] Google place search failed, falling back to Nominatim:', err);
    return null;
  }
}

function mapGoogleLatLngs(pts: GoogleLatLngLike[]): LatLon[] {
  return pts
    .map((p) => ({
      lat: typeof p.lat === 'function' ? p.lat() : Number(p.lat),
      lon: typeof p.lng === 'function' ? p.lng() : Number(p.lng),
    }))
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
}

function extractGoogleRoutePath(
  route: GoogleRouteInstance,
  origin: LatLon,
  destination: LatLon,
): LatLon[] {
  if (Array.isArray(route?.path) && route.path.length >= 2) {
    const coords = mapGoogleLatLngs(route.path);
    if (coords.length >= 2) return coords;
  }

  if (typeof route?.createPolylines === 'function') {
    try {
      const collected: LatLon[] = [];
      for (const poly of route.createPolylines() || []) {
        collected.push(...mapGoogleLatLngs(poly.getPath?.()?.getArray?.() || []));
      }
      if (collected.length >= 2) return collected;
    } catch {
      // fall through to straight line
    }
  }

  return [origin, destination];
}

function mapGoogleDriveRoutes(
  driveRoutes: GoogleRouteInstance[],
  origin: LatLon,
  destination: LatLon,
): RawRouteGeometry[] {
  return driveRoutes.slice(0, 2).map((r, idx) => ({
    id: idx === 0 ? 'car_main' : `car_alt_${idx}`,
    mode: 'car',
    label: idx === 0 ? 'Car (AC / windows shut)' : `Car Alt ${idx}`,
    summary: idx === 0 ? 'Fastest driving route' : 'Alternate route',
    distanceKm: Number(((r.distanceMeters || 0) / 1000).toFixed(1)),
    durationMin: Math.max(1, Math.round((r.durationMillis || 600000) / 60000)),
    path: extractGoogleRoutePath(r, origin, destination),
    isAlternative: idx > 0,
  }));
}

function mapGoogleBikeAndAutoRoutes(
  twoWheelerRoutes: GoogleRouteInstance[],
  driveRoutes: GoogleRouteInstance[],
  origin: LatLon,
  destination: LatLon,
): RawRouteGeometry[] {
  const source = twoWheelerRoutes.length > 0 ? twoWheelerRoutes : driveRoutes;
  if (source.length === 0) return [];
  const r = source[0];
  const distKm = Number(((r.distanceMeters || 0) / 1000).toFixed(1));
  const baseMin = Math.max(1, Math.round((r.durationMillis || 600000) / 60000));
  const path = extractGoogleRoutePath(r, origin, destination);

  return [
    {
      id: 'two_wheeler_main',
      mode: 'two_wheeler',
      label: 'Two-wheeler',
      summary: 'Direct road route',
      distanceKm: distKm,
      durationMin: twoWheelerRoutes.length > 0 ? baseMin : Math.max(2, Math.round(baseMin * 0.9)),
      path,
    },
    {
      id: 'auto_main',
      mode: 'auto',
      label: 'Auto-rickshaw',
      summary: 'Open-sided road route',
      distanceKm: distKm,
      durationMin: Math.max(3, Math.round(baseMin * 1.05)),
      path,
    },
  ];
}

function mapGoogleWalkRoute(
  walkRoutes: GoogleRouteInstance[],
  origin: LatLon,
  destination: LatLon,
): RawRouteGeometry[] {
  if (walkRoutes.length === 0) return [];
  const r = walkRoutes[0];
  return [
    {
      id: 'walk_main',
      mode: 'walk',
      label: 'Walk',
      summary: 'Footpath route',
      distanceKm: Number(((r.distanceMeters || 0) / 1000).toFixed(1)),
      durationMin: Math.max(2, Math.round((r.durationMillis || 1200000) / 60000)),
      path: extractGoogleRoutePath(r, origin, destination),
    },
  ];
}

/**
 * Fetches routes via the Maps JS Routes library (`google.maps.routes.Route.computeRoutes`).
 * Order: Google Routes -> OSRM (no legacy DirectionsService).
 * Logs at most one console.warn on failure.
 */
export async function fetchGoogleRoutes(
  origin: LatLon,
  destination: LatLon,
  departureTime: Date,
): Promise<RawRouteGeometry[] | null> {
  if (typeof window === 'undefined' || !window.google?.maps) return null;

  try {
    const routesLib = window.google.maps.importLibrary
      ? await window.google.maps.importLibrary('routes')
      : window.google.maps.routes;

    const RouteClass = routesLib?.Route;
    if (!RouteClass?.computeRoutes) {
      logger.warn(
        '[routingService] google.maps.routes.Route.computeRoutes unavailable; using OSRM.',
      );
      return null;
    }

    const fields = ['path', 'distanceMeters', 'durationMillis'];
    const isFutureDeparture = departureTime.getTime() > Date.now() + 60_000;
    let firstError: unknown = null;

    const computeMode = async (
      travelMode: 'DRIVING' | 'TWO_WHEELER' | 'WALKING',
    ): Promise<GoogleRouteInstance[]> => {
      try {
        const resp = await RouteClass.computeRoutes!({
          origin: { lat: origin.lat, lng: origin.lon },
          destination: { lat: destination.lat, lng: destination.lon },
          travelMode,
          computeAlternativeRoutes: true,
          fields,
          ...(travelMode !== 'WALKING' && isFutureDeparture ? { departureTime } : {}),
        });
        return Array.isArray(resp?.routes) ? resp.routes : [];
      } catch (err) {
        if (!firstError) firstError = err;
        return [];
      }
    };

    const [driveRoutes, twoWheelerRoutes, walkRoutes] = await Promise.all([
      computeMode('DRIVING'),
      computeMode('TWO_WHEELER'),
      computeMode('WALKING'),
    ]);

    const results: RawRouteGeometry[] = [
      ...mapGoogleDriveRoutes(driveRoutes, origin, destination),
      ...mapGoogleBikeAndAutoRoutes(twoWheelerRoutes, driveRoutes, origin, destination),
      ...mapGoogleWalkRoute(walkRoutes, origin, destination),
    ];

    if (results.length > 0) return results;

    logger.warn(
      '[routingService] Google Routes failed, falling back to OSRM:',
      firstError || 'No routes returned',
    );
    return null;
  } catch (err) {
    logger.warn('[routingService] Google Routes failed, falling back to OSRM:', err);
    return null;
  }
}
