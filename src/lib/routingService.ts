/**
 * Shwas Clean Routes — Routing & Place Search Service
 *
 * 1. Place search: Google Geocoder when Google Maps JS is loaded,
 *    with automatic fallback to Nominatim (OpenStreetMap).
 * 2. Route geometries: Google Maps JS Routes library (`google.maps.routes.Route.computeRoutes`)
 *    requesting `fields: ['path', 'distanceMeters', 'durationMillis']` with alternatives,
 *    falling back directly to public OSRM (`router.project-osrm.org`), then offline estimate.
 */

import { estimateMetroRoute, type LatLon, type RawRouteGeometry } from './routeExposure';
import { fetchGoogleRoutes, searchGooglePlaces } from './googleRouting';
import { buildOfflineFallbackRoutes, fetchOsrmRoutes, searchNominatimPlaces } from './osrmRouting';

export type RoutingProvider = 'google_routes' | 'osrm' | 'estimate';

export interface PlaceSuggestion {
  name: string;
  subtitle?: string;
  lat: number;
  lon: number;
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
  googleMapsReady = false,
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  if (googleMapsReady) {
    const googleHits = await searchGooglePlaces(trimmed, near);
    if (googleHits) return googleHits;
  }

  return searchNominatimPlaces(trimmed, near);
}

/**
 * Fetches all mode routes (Car, Two-wheeler, Auto, Walk, plus Metro estimate).
 * Order: Google Routes -> OSRM -> Offline Estimate.
 */
export async function fetchRoutesForTrip(
  origin: LatLon,
  destination: LatLon,
  departureTime: Date,
  googleMapsReady = false,
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
