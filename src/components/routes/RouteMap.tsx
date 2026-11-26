import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';
import type { EvaluatedRouteOption, LatLon } from '../../lib/routeExposure';
import { useGoogleRouteMap, useLeafletRouteMap, useMapProvider } from './useRouteMapHooks';

interface RouteMapProps {
  origin: LatLon;
  destination: LatLon | null;
  routes: EvaluatedRouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  onMapProviderChange?: (provider: 'google' | 'leaflet') => void;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
  onMapProviderChange,
}) => {
  const { t } = useTranslation();
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const leafletContainerRef = useRef<HTMLDivElement>(null);

  const { provider, setProvider, googleReady } = useMapProvider(onMapProviderChange);

  const handleFallbackToLeaflet = useCallback(() => {
    setProvider('leaflet');
    onMapProviderChange?.('leaflet');
  }, [onMapProviderChange, setProvider]);

  const overlay = { origin, destination, routes, selectedRouteId, onSelectRoute };

  useGoogleRouteMap({
    containerRef: googleContainerRef,
    provider,
    googleReady,
    overlay,
    onFallbackToLeaflet: handleFallbackToLeaflet,
  });

  useLeafletRouteMap({
    containerRef: leafletContainerRef,
    provider,
    overlay,
  });

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
          aria-label={t('routes.mapGoogleAria', 'Clean Routes Exposure Map (Google Maps)')}
        />
      ) : (
        <div className="shwas-leaflet-dark">
          <div
            ref={leafletContainerRef}
            className="w-full h-[270px] sm:h-[320px] z-0"
            role="region"
            aria-label={t('routes.mapOsmAria', 'Clean Routes Exposure Map (OpenStreetMap)')}
          />
        </div>
      )}

      <div className="absolute top-2.5 right-2.5 z-[400] px-2 py-0.5 rounded-full bg-surface-base/85 border border-white/15 backdrop-blur-md text-[10px] font-mono text-slate-300 pointer-events-none">
        {provider === 'google' ? 'Google Maps' : 'OSM · Leaflet'}
      </div>

      <div className="absolute bottom-2.5 left-2.5 z-[400] flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-surface-base/85 border border-white/10 backdrop-blur-md text-[10px] text-slate-300 pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-mint" /> {t('routes.legendCleanest', 'Cleanest')}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-aqi-amber" />{' '}
          {t('routes.legendModerate', 'Moderate')}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-aqi-verypoor" />{' '}
          {t('routes.legendHighest', 'Highest')}
        </span>
      </div>
    </div>
  );
};

export default RouteMap;
