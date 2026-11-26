import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EvaluatedRouteOption, LatLon } from '../../lib/routeExposure';

interface RouteMapProps {
  origin: LatLon;
  destination: LatLon | null;
  routes: EvaluatedRouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  onMapProviderChange?: (provider: 'google' | 'leaflet') => void;
}

// Dark Google Maps style matching Shwas dark glassmorphism palette
const DARK_GOOGLE_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f17' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#112224' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0f172a' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2b3b55' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#16253b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#081220' }],
  },
];

let googleMapsScriptPromise: Promise<boolean> | null = null;
let googleMapsAuthFailed = false;

function loadGoogleMapsScript(apiKey: string): Promise<boolean> {
  if (!apiKey || googleMapsAuthFailed) return Promise.resolve(false);
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);

  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise<boolean>((resolve) => {
    const prevAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      googleMapsAuthFailed = true;
      if (typeof prevAuthFailure === 'function') prevAuthFailure();
      resolve(false);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-shwas-gmaps="true"]');
    if (existing) {
      const checkTimer = setTimeout(() => resolve(Boolean(window.google?.maps?.Map && !googleMapsAuthFailed)), 4000);
      existing.addEventListener('load', () => {
        clearTimeout(checkTimer);
        resolve(Boolean(window.google?.maps?.Map && !googleMapsAuthFailed));
      });
      existing.addEventListener('error', () => {
        clearTimeout(checkTimer);
        resolve(false);
      });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places,routes&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.shwasGmaps = 'true';

    const timeout = setTimeout(() => {
      resolve(false);
    }, 6000);

    script.onload = () => {
      clearTimeout(timeout);
      // Wait briefly in case gm_authFailure fires immediately after init
      setTimeout(() => {
        resolve(Boolean(window.google?.maps?.Map && !googleMapsAuthFailed));
      }, 250);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
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

  const googleMapRef = useRef<any>(null);
  const googleOverlaysRef = useRef<any[]>([]);

  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [provider, setProvider] = useState<'google' | 'leaflet'>(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
    return key && !googleMapsAuthFailed ? 'google' : 'leaflet';
  });
  const [googleReady, setGoogleReady] = useState<boolean>(false);

  // 1. Attempt to initialize Google Maps if key exists; auto-fallback to Leaflet on failure/quota
  useEffect(() => {
    let active = true;
    const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();

    if (!apiKey || googleMapsAuthFailed) {
      setProvider('leaflet');
      onMapProviderChange?.('leaflet');
      return;
    }

    // Listen for runtime auth/quota failures from Google Maps
    const prevFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      googleMapsAuthFailed = true;
      if (typeof prevFailure === 'function') prevFailure();
      if (active) {
        setGoogleReady(false);
        setProvider('leaflet');
        onMapProviderChange?.('leaflet');
      }
    };

    loadGoogleMapsScript(apiKey).then((ok) => {
      if (!active) return;
      if (ok && window.google?.maps?.Map && !googleMapsAuthFailed) {
        setGoogleReady(true);
        setProvider('google');
        onMapProviderChange?.('google');
      } else {
        setGoogleReady(false);
        setProvider('leaflet');
        onMapProviderChange?.('leaflet');
      }
    });

    return () => {
      active = false;
    };
  }, [onMapProviderChange]);

  // 2. Render & update Google Map when active
  useEffect(() => {
    if (provider !== 'google' || !googleReady || !googleContainerRef.current || !window.google?.maps) {
      return;
    }

    try {
      if (!googleMapRef.current) {
        googleMapRef.current = new window.google.maps.Map(googleContainerRef.current, {
          center: { lat: origin.lat, lng: origin.lon },
          zoom: 12,
          styles: DARK_GOOGLE_MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          backgroundColor: '#0B0F17',
        });
      }

      const map = googleMapRef.current;

      // Clear previous overlays
      googleOverlaysRef.current.forEach((ov) => ov.setMap(null));
      googleOverlaysRef.current = [];

      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: origin.lat, lng: origin.lon });

      // Origin marker (mint)
      const originMarker = new window.google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lon },
        map,
        title: 'Origin',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#2DD4BF',
          fillOpacity: 1,
          strokeColor: '#0B0F17',
          strokeWeight: 2.5,
        },
        zIndex: 50,
      });
      googleOverlaysRef.current.push(originMarker);

      // Destination marker (amber)
      if (destination) {
        bounds.extend({ lat: destination.lat, lng: destination.lon });
        const destMarker = new window.google.maps.Marker({
          position: { lat: destination.lat, lng: destination.lon },
          map,
          title: 'Destination',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#F59E0B',
            fillOpacity: 1,
            strokeColor: '#0B0F17',
            strokeWeight: 2.5,
          },
          zIndex: 50,
        });
        googleOverlaysRef.current.push(destMarker);
      }

      // Draw routes sorted so selected route renders on top
      const sortedRoutes = [...routes].sort((a, b) =>
        a.id === selectedRouteId ? 1 : b.id === selectedRouteId ? -1 : 0
      );

      sortedRoutes.forEach((route) => {
        if (!route.path || route.path.length < 2) return;
        const isSelected = route.id === selectedRouteId;
        const pathLatLng = route.path.map((p) => {
          bounds.extend({ lat: p.lat, lng: p.lon });
          return { lat: p.lat, lng: p.lon };
        });

        const polyline = new window.google.maps.Polyline({
          path: pathLatLng,
          geodesic: true,
          strokeColor: route.strokeColor,
          strokeOpacity: isSelected ? 0.96 : 0.4,
          strokeWeight: isSelected ? 6 : 3.5,
          zIndex: isSelected ? 30 : 10,
          ...(route.mode === 'metro'
            ? {
                strokeOpacity: 0,
                icons: [
                  {
                    icon: {
                      path: 'M 0,-1 0,1',
                      strokeOpacity: isSelected ? 0.95 : 0.45,
                      strokeColor: route.strokeColor,
                      scale: isSelected ? 3.5 : 2.5,
                    },
                    offset: '0',
                    repeat: '12px',
                  },
                ],
              }
            : {}),
          map,
        });

        polyline.addListener('click', () => onSelectRoute(route.id));
        googleOverlaysRef.current.push(polyline);
      });

      if (destination || routes.length > 0) {
        map.fitBounds(bounds, 42);
      } else {
        map.setCenter({ lat: origin.lat, lng: origin.lon });
        map.setZoom(12);
      }
    } catch (err) {
      console.warn('[RouteMap] Google Maps runtime error, falling back to Leaflet:', err);
      setProvider('leaflet');
      onMapProviderChange?.('leaflet');
    }
  }, [provider, googleReady, origin, destination, routes, selectedRouteId, onSelectRoute, onMapProviderChange]);

  // 3. Initialize & update Leaflet + OpenStreetMap fallback
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

      // Ensure tiles size correctly after CSS transition
      setTimeout(() => map.invalidateSize(), 150);
    }

    const map = leafletMapRef.current;
    const layerGroup = leafletLayerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const latLngsForBounds: L.LatLngExpression[] = [[origin.lat, origin.lon]];

    // Draw routes (unselected first, selected on top)
    const sortedRoutes = [...routes].sort((a, b) =>
      a.id === selectedRouteId ? 1 : b.id === selectedRouteId ? -1 : 0
    );

    sortedRoutes.forEach((route) => {
      if (!route.path || route.path.length < 2) return;
      const isSelected = route.id === selectedRouteId;
      const latlngs: L.LatLngExpression[] = route.path.map((p) => {
        latLngsForBounds.push([p.lat, p.lon]);
        return [p.lat, p.lon];
      });

      const line = L.polyline(latlngs, {
        color: route.strokeColor,
        weight: isSelected ? 6 : 3.5,
        opacity: isSelected ? 0.95 : 0.42,
        dashArray: route.mode === 'metro' ? '7 7' : undefined,
      });

      line.on('click', () => onSelectRoute(route.id));
      line.addTo(layerGroup);
    });

    // Origin marker
    const originIcon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:9999px;background:#2DD4BF;border:2.5px solid #0B0F17;box-shadow:0 0 12px rgba(45,212,191,0.8);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([origin.lat, origin.lon], { icon: originIcon })
      .bindTooltip('Origin', { direction: 'top' })
      .addTo(layerGroup);

    // Destination marker
    if (destination) {
      latLngsForBounds.push([destination.lat, destination.lon]);
      const destIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:9999px;background:#F59E0B;border:2.5px solid #0B0F17;box-shadow:0 0 12px rgba(245,158,11,0.85);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([destination.lat, destination.lon], { icon: destIcon })
        .bindTooltip('Destination', { direction: 'top' })
        .addTo(layerGroup);
    }

    if (latLngsForBounds.length > 1) {
      map.fitBounds(L.latLngBounds(latLngsForBounds), { padding: [36, 36] });
    } else {
      map.setView([origin.lat, origin.lon], 12);
    }
  }, [provider, origin, destination, routes, selectedRouteId, onSelectRoute]);

  // Cleanup Leaflet map on unmount
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
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.1] bg-[#0B0F17] shadow-xl">
      {/* Map canvas container — fixed height so it is never blank */}
      {provider === 'google' ? (
        <div
          ref={googleContainerRef}
          className="w-full h-[270px] sm:h-[320px]"
          aria-label="Clean Routes Exposure Map (Google Maps)"
        />
      ) : (
        <div className="shwas-leaflet-dark">
          <div
            ref={leafletContainerRef}
            className="w-full h-[270px] sm:h-[320px] z-0"
            aria-label="Clean Routes Exposure Map (OpenStreetMap)"
          />
        </div>
      )}

      {/* Top-right Map Provider Indicator */}
      <div className="absolute top-2.5 right-2.5 z-[400] px-2 py-0.5 rounded-full bg-[#0B0F17]/85 border border-white/15 backdrop-blur-md text-[10px] font-mono text-slate-300 pointer-events-none">
        {provider === 'google' ? 'Google Maps' : 'OSM · Leaflet'}
      </div>

      {/* Bottom-left Exposure Legend */}
      <div className="absolute bottom-2.5 left-2.5 z-[400] flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-[#0B0F17]/85 border border-white/10 backdrop-blur-md text-[10px] text-slate-300 pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#2DD4BF]" /> Cleanest
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#EF4444]" /> Highest
        </span>
      </div>
    </div>
  );
};

export default RouteMap;
