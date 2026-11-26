import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EvaluatedRouteOption } from '../../lib/routeExposure';
import type { PlaceSuggestion, RoutingProvider } from '../../lib/routingService';
import { logger } from '../../lib/logger';
import { fetchAndEvaluateRoutes, type DeparturePreset } from './routeTimeHelpers';

export function useRouteEvaluation(params: {
  origin: PlaceSuggestion;
  destination: PlaceSuggestion | null;
  departurePreset: DeparturePreset;
  customTime: string;
  departureDate: Date;
  mapProvider: 'loading' | 'google' | 'leaflet';
  livePm25: number;
}) {
  const { t, i18n } = useTranslation();
  const { origin, destination, departurePreset, customTime, departureDate, mapProvider, livePm25 } =
    params;
  const [routingProvider, setRoutingProvider] = useState<RoutingProvider>('osrm');
  const [evaluatedRoutes, setEvaluatedRoutes] = useState<EvaluatedRouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const lastFetchKeyRef = useRef<string>('');
  const livePm25Ref = useRef<number>(livePm25 || 150);

  useEffect(() => {
    livePm25Ref.current = livePm25 || 150;
  }, [livePm25]);

  useEffect(() => {
    if (!destination || mapProvider === 'loading') return;
    const fetchKey = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}|${departurePreset}|${departurePreset === 'custom' ? customTime : ''}|${mapProvider}|${i18n.language}`;
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;

    let active = true;
    Promise.resolve()
      .then(async () => {
        if (!active) return;
        setIsLoadingRoutes(true);
        setRouteError(null);
        const { evaluated, provider } = await fetchAndEvaluateRoutes(
          origin,
          destination,
          departureDate,
          mapProvider,
          livePm25Ref.current,
          t,
        );
        if (!active) return;
        setRoutingProvider(provider);
        setEvaluatedRoutes(evaluated);
        const rec = evaluated.find((r) => r.recommended) || evaluated[0];
        setSelectedRouteId(rec ? rec.id : null);
      })
      .catch((err) => {
        if (!active) return;
        logger.warn('[RoutesPage] Failed to compute routes:', err);
        setRouteError(
          t(
            'routes.loadError',
            'Could not load route comparison right now. Please try another destination or retry.',
          ),
        );
      })
      .finally(() => {
        if (active) setIsLoadingRoutes(false);
      });

    return () => {
      active = false;
    };
  }, [
    origin,
    destination,
    departurePreset,
    customTime,
    departureDate,
    mapProvider,
    i18n.language,
    t,
  ]);

  return {
    routingProvider,
    evaluatedRoutes,
    selectedRouteId,
    setSelectedRouteId,
    isLoadingRoutes,
    routeError,
  };
}
