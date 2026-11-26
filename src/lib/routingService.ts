/**
 * Shwas Clean Routes — Routing & Place Search Service
 *
 * 1. Place search: Google Places / Geocoding API when Google Maps JS is loaded,
 *    with automatic fallback to Nominatim (OpenStreetMap).
 * 2. Route geometries: Google Routes library (google.maps.routes) with alternatives
 *    for Car, Two-wheeler/Auto, and Walk, with automatic fallback to public OSRM
 *    (router.project-osrm.org) and deterministic offline fallback.
 */

import {
  LatLon,
  RawRouteGeometry,
  estimateMetroRoute,
  haversineDistanceKm,
} from './routeExposure';

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

  // Generic realistic urban offsets (~4.5 km for school, ~7.5 km for office)
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
 * Searches for places via Google Geocoder/Places (when available) with automatic
 * fallback to OpenStreetMap Nominatim.
 */
export async function searchPlaces(
  query: string,
  near?: LatLon,
  googleMapsReady = false
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  // 1. Try Google Geocoder / Places when Google Maps JS is active
  if (googleMapsReady && window.google?.maps) {
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

  // 2. Nominatim fallback (free, no key)
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
 * Decodes an encoded Google polyline string into LatLon[].
 */
function decodeGooglePolyline(encoded: string): LatLon[] {
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return points;
}

export type RoutingProvider = 'google_routes' | 'google_directions' | 'osrm' | 'estimate';

/**
 * Attempts to fetch routes via the Google Maps Routes library (`google.maps.routes`)
 * with alternatives; logs exact errors and tries `DirectionsService` before OSRM.
 */
async function fetchGoogleRoutes(
  origin: LatLon,
  destination: LatLon,
  departureTime: Date
): Promise<{ routes: RawRouteGeometry[]; provider: 'google_routes' | 'google_directions' } | null> {
  if (!window.google?.maps) return null;

  let routesLib: any = window.google.maps;
  if (window.google.maps.importLibrary) {
    try {
      routesLib = await window.google.maps.importLibrary('routes');
    } catch (err) {
      console.warn('[routingService] google.maps.importLibrary("routes") failed:', err);
      routesLib = window.google.maps;
    }
  }

  // 1. Try modern google.maps.routes.Route.computeRoutes when available
  if (routesLib?.Route?.computeRoutes) {
    const results: RawRouteGeometry[] = [];
    const computeForTravelMode = async (
      travelMode: 'DRIVING' | 'TWO_WHEELER' | 'WALKING'
    ): Promise<any[]> => {
      try {
        const resp = await routesLib.Route.computeRoutes({
          origin: { lat: origin.lat, lng: origin.lon },
          destination: { lat: destination.lat, lng: destination.lon },
          travelMode,
          computeAlternativeRoutes: true,
          fields: ['path', 'distanceMeters', 'durationMillis', 'description', 'polyline'],
          ...(travelMode !== 'WALKING' && departureTime.getTime() > Date.now()
            ? { departureTime }
            : {}),
        });
        return Array.isArray(resp?.routes) ? resp.routes : [];
      } catch (err) {
        console.warn(
          `[routingService] google.maps.routes.Route.computeRoutes(${travelMode}) failed:`,
          err
        );
        return [];
      }
    };

    const [driveRoutes, twoWheelerRoutes, walkRoutes] = await Promise.all([
      computeForTravelMode('DRIVING'),
      computeForTravelMode('TWO_WHEELER'),
      computeForTravelMode('WALKING'),
    ]);

    const extractPath = (r: any): LatLon[] => {
      if (Array.isArray(r.path) && r.path.length >= 2) {
        return r.path.map((p: any) => ({
          lat: typeof p.lat === 'function' ? p.lat() : p.lat,
          lon: typeof p.lng === 'function' ? p.lng() : p.lng,
        }));
      }
      if (r.polyline?.encodedPolyline) {
        return decodeGooglePolyline(r.polyline.encodedPolyline);
      }
      return [origin, destination];
    };

    driveRoutes.slice(0, 2).forEach((r, idx) => {
      const distKm = Number(((r.distanceMeters || 0) / 1000).toFixed(1));
      const durMin = Math.max(1, Math.round((r.durationMillis || 600000) / 60000));
      results.push({
        id: idx === 0 ? 'car_main' : `car_alt_${idx}`,
        mode: 'car',
        label: idx === 0 ? 'Car (AC / windows shut)' : `Car Alt ${idx}`,
        summary: r.description || (idx === 0 ? 'Fastest driving route' : 'Alternate route'),
        distanceKm: distKm,
        durationMin: durMin,
        path: extractPath(r),
        isAlternative: idx > 0,
      });
    });

    const bikeSource = twoWheelerRoutes.length > 0 ? twoWheelerRoutes : driveRoutes;
    if (bikeSource.length > 0) {
      const r = bikeSource[0];
      const distKm = Number(((r.distanceMeters || 0) / 1000).toFixed(1));
      const baseMin = Math.max(1, Math.round((r.durationMillis || 600000) / 60000));
      const path = extractPath(r);
      results.push({
        id: 'two_wheeler_main',
        mode: 'two_wheeler',
        label: 'Two-wheeler',
        summary: r.description || 'Direct road route',
        distanceKm: distKm,
        durationMin: Math.max(2, Math.round(baseMin * 0.9)),
        path,
      });
      results.push({
        id: 'auto_main',
        mode: 'auto',
        label: 'Auto-rickshaw',
        summary: r.description || 'Open-sided road route',
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
        summary: r.description || 'Footpath route',
        distanceKm: Number(((r.distanceMeters || 0) / 1000).toFixed(1)),
        durationMin: Math.max(2, Math.round((r.durationMillis || 1200000) / 60000)),
        path: extractPath(r),
      });
    }

    if (results.length > 0) {
      return { routes: results, provider: 'google_routes' };
    }
    console.warn('[routingService] google.maps.routes returned no routes; trying DirectionsService.');
  } else {
    console.warn(
      '[routingService] google.maps.routes.Route.computeRoutes unavailable on this key; trying DirectionsService.'
    );
  }

  // 2. Fallback inside Google Maps JS SDK: DirectionsService before OSRM
  const ServiceCtor = routesLib?.DirectionsService || window.google.maps.DirectionsService;
  if (ServiceCtor) {
    try {
      const service = new ServiceCtor();
      const results: RawRouteGeometry[] = [];

      const requestMode = (travelMode: string): Promise<any[]> =>
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            console.warn(`[routingService] DirectionsService(${travelMode}) timed out`);
            resolve([]);
          }, 5000);
          service.route(
            {
              origin: { lat: origin.lat, lng: origin.lon },
              destination: { lat: destination.lat, lng: destination.lon },
              travelMode,
              provideRouteAlternatives: true,
            },
            (res: any, status: string) => {
              clearTimeout(timer);
              if (status === 'OK' && Array.isArray(res?.routes)) {
                resolve(res.routes);
              } else {
                console.warn(
                  `[routingService] DirectionsService(${travelMode}) failed with status:`,
                  status
                );
                resolve([]);
              }
            }
          );
        });

      const [driveRoutes, walkRoutes] = await Promise.all([
        requestMode('DRIVING'),
        requestMode('WALKING'),
      ]);

      const extractDirPath = (r: any): LatLon[] => {
        if (Array.isArray(r.overview_path) && r.overview_path.length >= 2) {
          return r.overview_path.map((p: any) => ({ lat: p.lat(), lon: p.lng() }));
        }
        if (r.overview_polyline) {
          const encoded =
            typeof r.overview_polyline === 'string'
              ? r.overview_polyline
              : r.overview_polyline.points;
          if (encoded) return decodeGooglePolyline(encoded);
        }
        return [origin, destination];
      };

      driveRoutes.slice(0, 2).forEach((r, idx) => {
        const leg = r.legs?.[0];
        const distKm = Number(((leg?.distance?.value || 5000) / 1000).toFixed(1));
        const durMin = Math.max(1, Math.round((leg?.duration?.value || 900) / 60));
        results.push({
          id: idx === 0 ? 'car_main' : `car_alt_${idx}`,
          mode: 'car',
          label: idx === 0 ? 'Car (AC / windows shut)' : `Car Alt ${idx}`,
          summary: r.summary || (idx === 0 ? 'Fastest driving route' : 'Alternate route'),
          distanceKm: distKm,
          durationMin: durMin,
          path: extractDirPath(r),
          isAlternative: idx > 0,
        });
      });

      if (driveRoutes.length > 0) {
        const leg = driveRoutes[0].legs?.[0];
        const distKm = Number(((leg?.distance?.value || 5000) / 1000).toFixed(1));
        const durMin = Math.max(1, Math.round((leg?.duration?.value || 900) / 60));
        const path = extractDirPath(driveRoutes[0]);
        results.push({
          id: 'two_wheeler_main',
          mode: 'two_wheeler',
          label: 'Two-wheeler',
          summary: driveRoutes[0].summary || 'Direct road route',
          distanceKm: distKm,
          durationMin: Math.max(2, Math.round(durMin * 0.9)),
          path,
        });
        results.push({
          id: 'auto_main',
          mode: 'auto',
          label: 'Auto-rickshaw',
          summary: driveRoutes[0].summary || 'Open road route',
          distanceKm: distKm,
          durationMin: Math.max(3, Math.round(durMin * 1.05)),
          path,
        });
      }

      if (walkRoutes.length > 0) {
        const leg = walkRoutes[0].legs?.[0];
        results.push({
          id: 'walk_main',
          mode: 'walk',
          label: 'Walk',
          summary: walkRoutes[0].summary || 'Footpath route',
          distanceKm: Number(((leg?.distance?.value || 4000) / 1000).toFixed(1)),
          durationMin: Math.max(2, Math.round((leg?.duration?.value || 3000) / 60)),
          path: extractDirPath(walkRoutes[0]),
        });
      }

      if (results.length > 0) {
        return { routes: results, provider: 'google_directions' };
      }
    } catch (err) {
      console.warn('[routingService] Google DirectionsService error:', err);
    }
  } else {
    console.warn('[routingService] Google DirectionsService not available; falling back to OSRM.');
  }

  return null;
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
    // Indian urban traffic adjustment factor (OSRM free-flow × 1.35)
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
    // Walking speed ~4.8 km/h
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
 * Fetches all mode routes (Car, Two-wheeler, Auto, Walk, plus Metro estimate)
 * using Google Routes first, then Google Directions, then OSRM fallback, then geometric fallback.
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
    const googleRes = await fetchGoogleRoutes(origin, destination, departureTime);
    if (googleRes && googleRes.routes.length > 0) {
      baseRoutes = googleRes.routes;
      provider = googleRes.provider;
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

  // Always include Metro estimate card
  const carRef = baseRoutes.find((r) => r.mode === 'car');
  const metroRoute = estimateMetroRoute(origin, destination, carRef?.distanceKm);

  return {
    routes: [metroRoute, ...baseRoutes],
    provider,
  };
}
