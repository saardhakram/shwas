import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
import { CHART_COLORS } from '../../shared/constants';
import { logger } from '../../lib/logger';

interface RouteMapProps {
  origin: LatLon;
  destination: LatLon | null;
  routes: EvaluatedRouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  onMapProviderChange?: (provider: 'google' | 'leaflet') => void;
}

function hasRequiredGoogleMapsApis(maps?: GoogleMapsNamespace): maps is GoogleMapsNamespace {
  return Boolean(maps?.Map && maps.LatLngBounds && maps.Polyline && maps.SymbolPath);
}

function useMapProvider(onMapProviderChange?: (provider: 'google' | 'leaflet') => void) {
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

export const RouteMap: React.FC<RouteMapProps> = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
  onMapProviderChange,
}) => {
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<GoogleMapInstance | null>(null);
  const googleOverlaysRef = useRef<GooglePolylineInstance[]>([]);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const { provider, setProvider, googleReady } = useMapProvider(onMapProviderChange);

  useEffect(() => {
    const maps = window.google?.maps;
    if (
      provider !== 'google' ||
      !googleReady ||
      !googleContainerRef.current ||
      !hasRequiredGoogleMapsApis(maps)
    ) {
      return;
    }

    try {
      if (!googleMapRef.current) {
        googleMapRef.current = new maps.Map!(googleContainerRef.current, {
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
      setProvider('leaflet');
      onMapProviderChange?.('leaflet');
    }
  }, [
    provider,
    googleReady,
    origin,
    destination,
    routes,
    selectedRouteId,
    onSelectRoute,
    onMapProviderChange,
    setProvider,
  ]);

  useEffect(() => {
    if (provider !== 'leaflet' || !leafletContainerRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(leafletContainerRef.current, {
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
  }, [provider, origin, destination, routes, selectedRouteId, onSelectRoute]);

  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerGroupRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="relative isolate rounded-2xl overflow-hidden border border-white/[0.1] bg-surface-base shadow-xl"
      style={{ isolation: 'isolate', contain: 'layout paint' }}
    >
      {provider === 'google' ? (
        <div
          ref={googleContainerRef}
          className="w-full h-[270px] sm:h-[320px]"
          role="region"
          aria-label="Clean Routes Exposure Map (Google Maps)"
        />
      ) : (
        <div className="shwas-leaflet-dark">
          <div
            ref={leafletContainerRef}
            className="w-full h-[270px] sm:h-[320px] z-0"
            role="region"
            aria-label="Clean Routes Exposure Map (OpenStreetMap)"
          />
        </div>
      )}

      <div className="absolute top-2.5 right-2.5 z-[400] px-2 py-0.5 rounded-full bg-surface-base/85 border border-white/15 backdrop-blur-md text-[10px] font-mono text-slate-300 pointer-events-none">
        {provider === 'google' ? 'Google Maps' : 'OSM · Leaflet'}
      </div>

      <div className="absolute bottom-2.5 left-2.5 z-[400] flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-surface-base/85 border border-white/10 backdrop-blur-md text-[10px] text-slate-300 pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-mint" /> Cleanest
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-aqi-amber" /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-aqi-verypoor" /> Highest
        </span>
      </div>
    </div>
  );
};

export default RouteMap;
