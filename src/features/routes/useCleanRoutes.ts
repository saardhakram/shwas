import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAirQuality } from '../../components/layout/AppLayout';
import { fetchOpenMeteoForecast, type ForecastDataPoint } from '../../lib/forecast';
import {
  computeDepartureTip,
  evaluateRouteOptions,
  fetchRoutePointsPm25,
  sampleRoutePoints,
  type EvaluatedRouteOption,
} from '../../lib/routeExposure';
import {
  fetchRoutesForTrip,
  getQuickDestinations,
  searchPlaces,
  type PlaceSuggestion,
  type RoutingProvider,
} from '../../lib/routingService';

export type DeparturePreset = 'now' | 'plus1h' | 'custom';

export function buildDepartureDate(preset: DeparturePreset, customTime: string): Date {
  const now = new Date();
  if (preset === 'now') return now;
  if (preset === 'plus1h') return new Date(now.getTime() + 60 * 60 * 1000);

  const [hh, mm] = (customTime || '14:30').split(':').map((n) => parseInt(n, 10));
  const custom = new Date(now);
  if (!isNaN(hh) && !isNaN(mm)) {
    custom.setHours(hh, mm, 0, 0);
    if (custom.getTime() < now.getTime() - 5 * 60 * 1000) {
      custom.setDate(custom.getDate() + 1);
    }
  }
  return custom;
}

export function parseTipTimeTo24h(bestTimeLabel: string): string | null {
  const match = bestTimeLabel.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hh = parseInt(match[1], 10);
  const mm = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  return `${hh.toString().padStart(2, '0')}:${mm}`;
}

async function fetchAndEvaluateRoutes(
  orig: PlaceSuggestion,
  dest: PlaceSuggestion,
  depDate: Date,
  providerMode: 'google' | 'leaflet',
  fallbackPm: number,
): Promise<{ evaluated: EvaluatedRouteOption[]; provider: RoutingProvider }> {
  const { routes, provider } = await fetchRoutesForTrip(
    { lat: orig.lat, lon: orig.lon },
    { lat: dest.lat, lon: dest.lon },
    depDate,
    providerMode === 'google',
  );

  const sampledPerRoute = routes.map((r) => sampleRoutePoints(r.path, 5));
  const pm25Values = await fetchRoutePointsPm25(sampledPerRoute.flat(), depDate, fallbackPm);

  let offset = 0;
  const routeAvgPm25s = sampledPerRoute.map((pts) => {
    const slice = pm25Values.slice(offset, offset + pts.length);
    offset += pts.length;
    return slice.length === 0 ? fallbackPm : slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  return { evaluated: evaluateRouteOptions(routes, routeAvgPm25s), provider };
}

function useRouteEvaluation(params: {
  origin: PlaceSuggestion;
  destination: PlaceSuggestion | null;
  departurePreset: DeparturePreset;
  customTime: string;
  departureDate: Date;
  mapProvider: 'loading' | 'google' | 'leaflet';
  livePm25: number;
}) {
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

  const computeRoutes = useCallback(
    async (
      orig: PlaceSuggestion,
      dest: PlaceSuggestion,
      depDate: Date,
      providerMode: 'google' | 'leaflet',
    ) => {
      setIsLoadingRoutes(true);
      setRouteError(null);
      try {
        const { evaluated, provider } = await fetchAndEvaluateRoutes(
          orig,
          dest,
          depDate,
          providerMode,
          livePm25Ref.current,
        );
        setRoutingProvider(provider);
        setEvaluatedRoutes(evaluated);
        const rec = evaluated.find((r) => r.recommended) || evaluated[0];
        setSelectedRouteId(rec ? rec.id : null);
      } catch (err) {
        console.warn('[RoutesPage] Failed to compute routes:', err);
        setRouteError(
          'Could not load route comparison right now. Please try another destination or retry.',
        );
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!destination || mapProvider === 'loading') return;
    const fetchKey = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}|${departurePreset}|${departurePreset === 'custom' ? customTime : ''}|${mapProvider}`;
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;
    computeRoutes(origin, destination, departureDate, mapProvider);
  }, [origin, destination, departurePreset, customTime, departureDate, mapProvider, computeRoutes]);

  return {
    routingProvider,
    evaluatedRoutes,
    selectedRouteId,
    setSelectedRouteId,
    isLoadingRoutes,
    routeError,
  };
}

export function useCleanRoutes() {
  const { pm25: livePm25, userProfile } = useAirQuality();

  const savedHome = useMemo(
    () => userProfile?.location || { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
    [userProfile],
  );
  const quickPresets = useMemo(() => getQuickDestinations(savedHome), [savedHome]);

  const [origin, setOrigin] = useState<PlaceSuggestion>(quickPresets.home);
  const [originInput, setOriginInput] = useState<string>(quickPresets.home.name);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destination, setDestination] = useState<PlaceSuggestion | null>(quickPresets.office);
  const [destInput, setDestInput] = useState<string>(quickPresets.office.name);
  const [destSuggestions, setDestSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingTo, setIsSearchingTo] = useState<boolean>(false);

  const [departurePreset, setDeparturePreset] = useState<DeparturePreset>('now');
  const [customTime, setCustomTime] = useState<string>('14:30');
  const [mapProvider, setMapProvider] = useState<'loading' | 'google' | 'leaflet'>('loading');
  const [forecastPoints, setForecastPoints] = useState<ForecastDataPoint[]>([]);

  useEffect(() => {
    setOrigin(quickPresets.home);
    setOriginInput(quickPresets.home.name);
  }, [quickPresets.home]);

  useEffect(() => {
    let active = true;
    fetchOpenMeteoForecast(origin.lat, origin.lon).then((res) => {
      if (active) setForecastPoints(res.points);
    });
    return () => {
      active = false;
    };
  }, [origin.lat, origin.lon]);

  const departureDate = useMemo(
    () => buildDepartureDate(departurePreset, customTime),
    [departurePreset, customTime],
  );
  const departureTip = useMemo(
    () => computeDepartureTip(forecastPoints, departureDate, departurePreset === 'now'),
    [forecastPoints, departureDate, departurePreset],
  );

  const evaluation = useRouteEvaluation({
    origin,
    destination,
    departurePreset,
    customTime,
    departureDate,
    mapProvider,
    livePm25,
  });

  const handleDestSearch = async (query: string) => {
    setDestInput(query);
    if (query.trim().length < 2) return setDestSuggestions([]);
    setIsSearchingTo(true);
    setDestSuggestions(
      await searchPlaces(query, { lat: origin.lat, lon: origin.lon }, mapProvider === 'google'),
    );
    setIsSearchingTo(false);
  };

  const handleOriginSearch = async (query: string) => {
    setOriginInput(query);
    if (query.trim().length < 2) return setOriginSuggestions([]);
    setOriginSuggestions(
      await searchPlaces(
        query,
        { lat: savedHome.lat, lon: savedHome.lon },
        mapProvider === 'google',
      ),
    );
  };

  const handleChipClick = (chip: 'home' | 'school' | 'office') => {
    if (chip === 'home') {
      setOrigin(quickPresets.home);
      setOriginInput(quickPresets.home.name);
      setOriginSuggestions([]);
      return;
    }
    const target = quickPresets[chip];
    setDestination(target);
    setDestInput(target.name);
    setDestSuggestions([]);
  };

  const handleApplyTipTime = () => {
    const parsed = departureTip ? parseTipTimeTo24h(departureTip.bestTimeLabel) : null;
    if (!parsed) return;
    setCustomTime(parsed);
    setDeparturePreset('custom');
  };

  const handleMapProviderChange = useCallback((p: 'google' | 'leaflet') => setMapProvider(p), []);

  return {
    quickPresets,
    origin,
    setOrigin,
    originInput,
    setOriginInput,
    originSuggestions,
    setOriginSuggestions,
    destination,
    setDestination,
    destInput,
    setDestInput,
    destSuggestions,
    setDestSuggestions,
    isSearchingTo,
    departurePreset,
    setDeparturePreset,
    customTime,
    setCustomTime,
    ...evaluation,
    departureTip,
    handleDestSearch,
    handleOriginSearch,
    handleChipClick,
    handleApplyTipTime,
    handleMapProviderChange,
  };
}
