/**
 * Shwas Clean Routes — Routing & Place Search Service
 *
 * 1. Place search: Google Geocoder when Google Maps JS is loaded,
 *    with automatic fallback to Nominatim (OpenStreetMap).
 * 2. Route geometries: Google Maps JS Routes library (`google.maps.routes.Route.computeRoutes`)
 *    requesting `fields: ['path', 'distanceMeters', 'durationMillis']` with alternatives,
 *    falling back directly to public OSRM (`router.project-osrm.org`), then offline estimate.
 */

import {
  LatLon,
  RawRouteGeometry,
  estimateMetroRoute,
  haversineDistanceKm,
} from './routeExposure';

export type RoutingProvider = 'google_routes' | 'osrm' | 'estimate';

export interface PlaceSuggestion {
  name: string;
  subtitle?: string;
  lat: number;
  lon: number;
}

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
  }
}

/**
 * Generates contextual quick-destination presets (School, Office) near the user's home.
 */
export function getQuickDestinations(home: { lat: number; lon: number; name: string }): {
  home: PlaceSuggestion;
  school: PlaceSuggestion;
  office: PlaceSuggestion;
} {
  const isDelhi =
    home.name.toLowerCase().includes('delhi') ||
    (Math.abs(home.lat - 28.61) < 0.4 && Math.abs(home.lon - 77.21) < 0.4);

  if (isDelhi) {
    return {
      home: { name: home.name, subtitle: 'Saved Home', lat: home.lat, lon: home.lon },
      school: {
        name: 'DPS R.K. Puram',
        subtitle: 'School · Sector 12, New Delhi',
        lat: 28.5628,
        lon: 77.1745,
      },
      office: {
        name: 'Connaught Place',
        subtitle: 'Office · Central Delhi',
        lat: 28.6315,
        lon: 77.2167,
      },
    };
  }

  return {
    home: { name: home.name, subtitle: 'Saved Home', lat: home.lat, lon: home.lon },
    school: {
      name: `${home.name} Public School`,
      subtitle: 'School (~4.5 km)',
      lat: Number((home.lat + 0.028).toFixed(5)),
      lon: Number((home.lon + 0.024).toFixed(5)),
    },
    office: {
      name: `${home.name} City Center`,
      subtitle: 'Office (~7.5 km)',
      lat: Number((home.lat - 0.042).toFixed(5)),
      lon: Number((home.lon + 0.048).toFixed(5)),
    },
  };
}

/**
 * Searches for places via Google Geocoder (when available) with automatic
 * fallback to OpenStreetMap Nominatim.
 */
export async function searchPlaces(
  query: string,
  near?: LatLon,
  googleMapsReady = false
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  if (googleMapsReady && typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
    try {
      const geocoder = new window.google.maps.Geocoder();
      const response = await new Promise<any[]>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Google geocode timeout')), 4500);
        geocoder.geocode(
          {
            address: trimmed,
            region: 'in',
            ...(near
              ? {
                  bounds: new window.google.maps.LatLngBounds(
                    { lat: near.lat - 0.3, lng: near.lon - 0.3 },
                    { lat: near.lat + 0.3, lng: near.lon + 0.3 }
                  ),
                }
              : {}),
          },
          (results: any[], status: string) => {
            clearTimeout(timeout);
            if (status === 'OK' && Array.isArray(results) && results.length > 0) {
              resolve(results);
            } else {
              reject(new Error(`Google geocode status: ${status}`));
            }
          }
        );
      });

      return response.slice(0, 5).map((r: any) => {
        const parts = String(r.formatted_address || trimmed).split(',');
        return {
          name: parts[0]?.trim() || trimmed,
          subtitle: parts.slice(1, 3).join(',').trim(),
          lat: r.geometry.location.lat(),
          lon: r.geometry.location.lng(),
        };
      });
    } catch (err) {
      console.warn('[routingService] Google place search failed, falling back to Nominatim:', err);
    }
  }

  try {
    const viewbox = near
      ? `&viewbox=${(near.lon - 0.5).toFixed(3)},${(near.lat + 0.5).toFixed(3)},${(near.lon + 0.5).toFixed(3)},${(near.lat - 0.5).toFixed(3)}`
      : '';
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      trimmed
    )}&countrycodes=in&limit=5${viewbox}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => {
      const parts = String(item.display_name || trimmed).split(',');
      return {
        name: parts[0]?.trim() || trimmed,
        subtitle: parts.slice(1, 3).join(',').trim(),
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      };
    });
  } catch (err) {
    console.warn('[routingService] Nominatim search failed:', err);
    return [];
  }
}

/**
 * Extracts LatLon[] from a google.maps.routes.Route instance using `route.path`
 * (or `route.createPolylines()` if `path` is not directly populated).
 */
function extractGoogleRoutePath(route: any, origin: LatLon, destination: LatLon): LatLon[] {
  const mapPoints = (pts: any[]): LatLon[] =>
    pts
      .map((p: any) => ({
        lat: typeof p.lat === 'function' ? p.lat() : Number(p.lat),
        lon: typeof p.lng === 'function' ? p.lng() : Number(p.lng),
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));

  if (Array.isArray(route?.path) && route.path.length >= 2) {
    const coords = mapPoints(route.path);
    if (coords.length >= 2) return coords;
  }

  if (typeof route?.createPolylines === 'function') {
    try {
      const polylines = route.createPolylines();
      const collected: LatLon[] = [];
      for (const poly of polylines || []) {
        const mvc = poly.getPath?.();
        const arr = mvc?.getArray?.() || [];
        collected.push(...mapPoints(arr));
      }
      if (collected.length >= 2) return collected;
    } catch {
      // fall through to straight line
    }
  }

  return [origin, destination];
}

/**
 * Fetches routes via the Maps JS Routes library (`google.maps.routes.Route.computeRoutes`).
 * Order: Google Routes -> OSRM (no legacy DirectionsService).
 * Logs at most one console.warn on failure.
 */
async function fetchGoogleRoutes(
  origin: LatLon,
  destination: LatLon,
  departureTime: Date
): Promise<RawRouteGeometry[] | null> {
  if (typeof window === 'undefined' || !window.google?.maps) return null;

  try {
    const routesLib = window.google.maps.importLibrary
      ? await window.google.maps.importLibrary('routes')
      : window.google.maps.routes;

    const RouteClass = routesLib?.Route;
    if (!RouteClass?.computeRoutes) {
      console.warn('[routingService] google.maps.routes.Route.computeRoutes unavailable; using OSRM.');
      return null;
    }

    const fields = ['path', 'distanceMeters', 'durationMillis'];
    const isFutureDeparture = departureTime.getTime() > Date.now() + 60_000;
    let firstError: unknown = null;

    const computeForTravelMode = async (
      travelMode: 'DRIVING' | 'TWO_WHEELER' | 'WALKING'
    ): Promise<any[]> => {
      try {
        const resp = await RouteClass.computeRoutes({
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
      computeForTravelMode('DRIVING'),
      computeForTravelMode('TWO_WHEELER'),
      computeForTravelMode('WALKING'),
    ]);

    const results: RawRouteGeometry[] = [];

    driveRoutes.slice(0, 2).forEach((r, idx) => {
      const distKm = Number(((r.distanceMeters || 0) / 1000).toFixed(1));
      const durMin = Math.max(1, Math.round((r.durationMillis || 600000) / 60000));
      results.push({
        id: idx === 0 ? 'car_main' : `car_alt_${idx}`,
        mode: 'car',
        label: idx === 0 ? 'Car (AC / windows shut)' : `Car Alt ${idx}`,
        summary: idx === 0 ? 'Fastest driving route' : 'Alternate route',
        distanceKm: distKm,
        durationMin: durMin,
        path: extractGoogleRoutePath(r, origin, destination),
        isAlternative: idx > 0,
      });
    });

    const bikeSource = twoWheelerRoutes.length > 0 ? twoWheelerRoutes : driveRoutes;
    if (bikeSource.length > 0) {
      const r = bikeSource[0];
      const distKm = Number(((r.distanceMeters || 0) / 1000).toFixed(1));
      const baseMin = Math.max(1, Math.round((r.durationMillis || 600000) / 60000));
      const path = extractGoogleRoutePath(r, origin, destination);
      results.push({
        id: 'two_wheeler_main',
        mode: 'two_wheeler',
        label: 'Two-wheeler',
        summary: 'Direct road route',
        distanceKm: distKm,
        durationMin: twoWheelerRoutes.length > 0 ? baseMin : Math.max(2, Math.round(baseMin * 0.9)),
        path,
      });
      results.push({
        id: 'auto_main',
        mode: 'auto',
        label: 'Auto-rickshaw',
        summary: 'Open-sided road route',
        distanceKm: distKm,
        durationMin: Math.max(3, Math.round(baseMin * 1.05)),
        path,
      });
    }

    if (walkRoutes.length > 0) {
      const r = walkRoutes[0];
      results.push({
        id: 'walk_main',
        mode: 'walk',
        label: 'Walk',
        summary: 'Footpath route',
        distanceKm: Number(((r.distanceMeters || 0) / 1000).toFixed(1)),
        durationMin: Math.max(2, Math.round((r.durationMillis || 1200000) / 60000)),
        path: extractGoogleRoutePath(r, origin, destination),
      });
    }

    if (results.length > 0) {
      return results;
    }

    console.warn(
      '[routingService] Google Routes failed, falling back to OSRM:',
      firstError || 'No routes returned'
    );
    return null;
  } catch (err) {
    console.warn('[routingService] Google Routes failed, falling back to OSRM:', err);
    return null;
  }
}

/**
 * Fallback router using public OSRM (router.project-osrm.org) with alternatives.
 */
async function fetchOsrmRoutes(
  origin: LatLon,
  destination: LatLon
): Promise<RawRouteGeometry[] | null> {
  const coordStr = `${origin.lon.toFixed(5)},${origin.lat.toFixed(5)};${destination.lon.toFixed(5)},${destination.lat.toFixed(5)}`;

  const queryOsrm = async (profile: 'driving' | 'foot'): Promise<any[]> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const url = `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson&alternatives=true`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      const json = await res.json();
      return json?.code === 'Ok' && Array.isArray(json.routes) ? json.routes : [];
    } catch {
      return [];
    }
  };

  const [driveRoutes, footRoutes] = await Promise.all([
    queryOsrm('driving'),
    queryOsrm('foot'),
  ]);

  if (driveRoutes.length === 0 && footRoutes.length === 0) return null;

  const results: RawRouteGeometry[] = [];
  const toLatLon = (coords: number[][]): LatLon[] =>
    coords.map(([lon, lat]) => ({ lat, lon }));

  driveRoutes.slice(0, 2).forEach((r, idx) => {
    const distKm = Number(((r.distance || 0) / 1000).toFixed(1));
    const durMin = Math.max(2, Math.round(((r.duration || 600) / 60) * 1.35));
    const path = r.geometry?.coordinates ? toLatLon(r.geometry.coordinates) : [origin, destination];
    const legSummary = r.legs?.[0]?.summary;

    results.push({
      id: idx === 0 ? 'car_main' : `car_alt_${idx}`,
      mode: 'car',
      label: idx === 0 ? 'Car (AC / windows shut)' : `Car Alt ${idx}`,
      summary: legSummary ? `via ${legSummary}` : idx === 0 ? 'Fastest driving route' : 'Alternate route',
      distanceKm: distKm,
      durationMin: durMin,
      path,
      isAlternative: idx > 0,
    });
  });

  if (driveRoutes.length > 0) {
    const r = driveRoutes[0];
    const distKm = Number(((r.distance || 0) / 1000).toFixed(1));
    const carMin = Math.max(2, Math.round(((r.duration || 600) / 60) * 1.35));
    const path = r.geometry?.coordinates ? toLatLon(r.geometry.coordinates) : [origin, destination];
    const legSummary = r.legs?.[0]?.summary;

    results.push({
      id: 'two_wheeler_main',
      mode: 'two_wheeler',
      label: 'Two-wheeler',
      summary: legSummary ? `via ${legSummary}` : 'Direct traffic route',
      distanceKm: distKm,
      durationMin: Math.max(2, Math.round(carMin * 0.88)),
      path,
    });

    results.push({
      id: 'auto_main',
      mode: 'auto',
      label: 'Auto-rickshaw',
      summary: legSummary ? `via ${legSummary}` : 'Open road route',
      distanceKm: distKm,
      durationMin: Math.max(3, Math.round(carMin * 1.05)),
      path,
    });
  }

  if (footRoutes.length > 0) {
    const r = footRoutes[0];
    const distKm = Number(((r.distance || 0) / 1000).toFixed(1));
    const durMin = Math.max(2, Math.round((distKm / 4.8) * 60));
    const path = r.geometry?.coordinates ? toLatLon(r.geometry.coordinates) : [origin, destination];
    results.push({
      id: 'walk_main',
      mode: 'walk',
      label: 'Walk',
      summary: r.legs?.[0]?.summary ? `via ${r.legs[0].summary}` : 'Walking path',
      distanceKm: distKm,
      durationMin: durMin,
      path,
    });
  }

  return results;
}

/**
 * Offline geometric estimate when both Google Routes and OSRM are unreachable.
 */
function buildOfflineFallbackRoutes(
  origin: LatLon,
  destination: LatLon
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

/**
 * Fetches all mode routes (Car, Two-wheeler, Auto, Walk, plus Metro estimate).
 * Order: Google Routes -> OSRM -> Offline Estimate.
 */
export async function fetchRoutesForTrip(
  origin: LatLon,
  destination: LatLon,
  departureTime: Date,
  googleMapsReady = false
): Promise<{ routes: RawRouteGeometry[]; provider: RoutingProvider }> {
  let baseRoutes: RawRouteGeometry[] | null = null;
  let provider: RoutingProvider = 'estimate';

  if (googleMapsReady) {
    const googleRoutes = await fetchGoogleRoutes(origin, destination, departureTime);
    if (googleRoutes && googleRoutes.length > 0) {
      baseRoutes = googleRoutes;
      provider = 'google_routes';
    }
  }

  if (!baseRoutes || baseRoutes.length === 0) {
    baseRoutes = await fetchOsrmRoutes(origin, destination);
    if (baseRoutes && baseRoutes.length > 0) {
      provider = 'osrm';
    }
  }

  if (!baseRoutes || baseRoutes.length === 0) {
    baseRoutes = buildOfflineFallbackRoutes(origin, destination);
    provider = 'estimate';
  }

  const carRef = baseRoutes.find((r) => r.mode === 'car');
  const metroRoute = estimateMetroRoute(origin, destination, carRef?.distanceKm);

  return {
    routes: [metroRoute, ...baseRoutes],
    provider,
  };
}
