import { useEffect, useRef, useState, type RefObject } from 'react';
import L from 'leaflet';
import type { EvaluatedRouteOption, LatLon } from '../../lib/routeExposure';
import type {
  GoogleMapInstance,
  GoogleMapsNamespace,
  GooglePolylineInstance,
} from '../../types/maps';
import {
  DARK_GOOGLE_MAP_STYLES,
  hasGoogleMapsAuthFailed,
  loadGoogleMapsScript,
  markGoogleMapsAuthFailed,
} from './googleMapsLoader';
import { drawGoogleMapOverlays, drawLeafletMapOverlays } from './mapRenderers';
import { CHART_COLORS } from '@shared/constants';
import { logger } from '../../lib/logger';

export interface RouteMapOverlayParams {
  origin: LatLon;
  destination: LatLon | null;
  routes: EvaluatedRouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
}

function hasRequiredGoogleMapsApis(maps?: GoogleMapsNamespace): maps is GoogleMapsNamespace {
  return Boolean(maps?.Map && maps.LatLngBounds && maps.Polyline && maps.SymbolPath);
}

export function useMapProvider(onMapProviderChange?: (provider: 'google' | 'leaflet') => void) {
  const [provider, setProvider] = useState<'google' | 'leaflet'>(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
    return key && !hasGoogleMapsAuthFailed() ? 'google' : 'leaflet';
  });
  const [googleReady, setGoogleReady] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();
    const fallbackToLeaflet = () => {
      if (!active) return;
      setGoogleReady(false);
      setProvider('leaflet');
      onMapProviderChange?.('leaflet');
    };

    if (!apiKey || hasGoogleMapsAuthFailed()) {
      onMapProviderChange?.('leaflet');
      return;
    }

    const prevFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      markGoogleMapsAuthFailed();
      if (typeof prevFailure === 'function') prevFailure();
      fallbackToLeaflet();
    };

    loadGoogleMapsScript(apiKey).then((ok) => {
      if (!active) return;
      if (ok && window.google?.maps?.Map && !hasGoogleMapsAuthFailed()) {
        setGoogleReady(true);
        setProvider('google');
        onMapProviderChange?.('google');
      } else {
        fallbackToLeaflet();
      }
    });

    return () => {
      active = false;
    };
  }, [onMapProviderChange]);

  return { provider, setProvider, googleReady };
}

export function useGoogleRouteMap(params: {
  containerRef: RefObject<HTMLDivElement>;
  provider: 'google' | 'leaflet';
  googleReady: boolean;
  overlay: RouteMapOverlayParams;
  onFallbackToLeaflet: () => void;
}): void {
  const { containerRef, provider, googleReady, overlay, onFallbackToLeaflet } = params;
  const { origin, destination, routes, selectedRouteId, onSelectRoute } = overlay;
  const googleMapRef = useRef<GoogleMapInstance | null>(null);
  const googleOverlaysRef = useRef<GooglePolylineInstance[]>([]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (
      provider !== 'google' ||
      !googleReady ||
      !containerRef.current ||
      !hasRequiredGoogleMapsApis(maps)
    ) {
      return;
    }

    try {
      if (!googleMapRef.current) {
        googleMapRef.current = new maps.Map!(containerRef.current, {
          center: { lat: origin.lat, lng: origin.lon },
          zoom: 12,
          styles: DARK_GOOGLE_MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          backgroundColor: CHART_COLORS.surfaceBase,
        });
      }

      googleOverlaysRef.current.forEach((ov) => ov.setMap(null));
      googleOverlaysRef.current = drawGoogleMapOverlays({
        maps,
        map: googleMapRef.current,
        origin,
        destination,
        routes,
        selectedRouteId,
        onSelectRoute,
      });
    } catch (err) {
      logger.warn('[RouteMap] Google Maps runtime error, falling back to Leaflet:', err);
      onFallbackToLeaflet();
    }
  }, [
    containerRef,
    provider,
    googleReady,
    origin,
    destination,
    routes,
    selectedRouteId,
    onSelectRoute,
    onFallbackToLeaflet,
  ]);
}

export function useLeafletRouteMap(params: {
  containerRef: RefObject<HTMLDivElement>;
  provider: 'google' | 'leaflet';
  overlay: RouteMapOverlayParams;
}): void {
  const { containerRef, provider, overlay } = params;
  const { origin, destination, routes, selectedRouteId, onSelectRoute } = overlay;
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (provider !== 'leaflet' || !containerRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(containerRef.current, {
        center: [origin.lat, origin.lon],
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      leafletLayerGroupRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    }

    if (!leafletMapRef.current || !leafletLayerGroupRef.current) return;

    drawLeafletMapOverlays({
      map: leafletMapRef.current,
      layerGroup: leafletLayerGroupRef.current,
      origin,
      destination,
      routes,
      selectedRouteId,
      onSelectRoute,
    });
  }, [containerRef, provider, origin, destination, routes, selectedRouteId, onSelectRoute]);

  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerGroupRef.current = null;
      }
    };
  }, []);
}
