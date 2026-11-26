import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAirQuality } from '../../components/layout/AppLayout';
import { fetchOpenMeteoForecast, type ForecastDataPoint } from '../../lib/forecast';
import { computeDepartureTip } from '../../lib/routeExposure';
import { getQuickDestinations } from '../../lib/routingService';
import { buildDepartureDate, parseTipTimeTo24h, type DeparturePreset } from './routeTimeHelpers';
import { usePlaceSearch } from './usePlaceSearch';
import { useRouteEvaluation } from './useRouteEvaluation';

export { buildDepartureDate, parseTipTimeTo24h };
export type { DeparturePreset };

export function useCleanRoutes() {
  const { t, i18n } = useTranslation();
  const { pm25: livePm25, userProfile } = useAirQuality();

  const savedHome = useMemo(
    () => userProfile?.location || { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
    [userProfile],
  );
  const quickPresets = useMemo(() => getQuickDestinations(savedHome), [savedHome]);

  const [departurePreset, setDeparturePresetState] = useState<DeparturePreset>('now');
  const [customTime, setCustomTimeState] = useState<string>('14:30');
  const [referenceNow, setReferenceNow] = useState<Date>(() => new Date());
  const [mapProvider, setMapProvider] = useState<'loading' | 'google' | 'leaflet'>('loading');
  const [forecastPoints, setForecastPoints] = useState<ForecastDataPoint[]>([]);

  const places = usePlaceSearch(quickPresets, savedHome, mapProvider === 'google');

  useEffect(() => {
    let active = true;
    fetchOpenMeteoForecast(places.origin.lat, places.origin.lon).then((res) => {
      if (active) setForecastPoints(res.points);
    });
    return () => {
      active = false;
    };
  }, [places.origin.lat, places.origin.lon]);

  const departureDate = useMemo(
    () => buildDepartureDate(departurePreset, customTime, referenceNow),
    [departurePreset, customTime, referenceNow],
  );
  const departureTip = useMemo(
    () =>
      computeDepartureTip(
        forecastPoints,
        departureDate,
        departurePreset === 'now',
        t,
        i18n.language,
      ),
    [forecastPoints, departureDate, departurePreset, t, i18n.language],
  );

  const evaluation = useRouteEvaluation({
    origin: places.origin,
    destination: places.destination,
    departurePreset,
    customTime,
    departureDate,
    mapProvider,
    livePm25,
  });

  const setDeparturePreset = (preset: DeparturePreset) => {
    setReferenceNow(new Date());
    setDeparturePresetState(preset);
  };

  const setCustomTime = (time: string) => {
    setReferenceNow(new Date());
    setCustomTimeState(time);
  };

  const handleApplyTipTime = () => {
    const parsed = departureTip
      ? departureTip.bestTime24h || parseTipTimeTo24h(departureTip.bestTimeLabel)
      : null;
    if (!parsed) return;
    setReferenceNow(new Date());
    setCustomTimeState(parsed);
    setDeparturePresetState('custom');
  };

  const handleMapProviderChange = useCallback((p: 'google' | 'leaflet') => setMapProvider(p), []);

  return {
    quickPresets,
    ...places,
    departurePreset,
    setDeparturePreset,
    customTime,
    setCustomTime,
    ...evaluation,
    departureTip,
    handleApplyTipTime,
    handleMapProviderChange,
  };
}
