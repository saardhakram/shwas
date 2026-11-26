import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Search,
  Train,
  Car,
  Bike,
  Footprints,
  Navigation,
  Clock,
  Sparkles,
  Leaf,
  Cigarette,
  ExternalLink,
  Home,
  GraduationCap,
  Briefcase,
  ArrowRight,
  Loader2,
  X,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import RouteMap from '../components/routes/RouteMap';
import { useAirQuality } from '../components/layout/AppLayout';
import { fetchOpenMeteoForecast, ForecastDataPoint } from '../lib/forecast';
import {
  EvaluatedRouteOption,
  RouteMode,
  sampleRoutePoints,
  fetchRoutePointsPm25,
  evaluateRouteOptions,
  computeDepartureTip,
} from '../lib/routeExposure';
import {
  PlaceSuggestion,
  RoutingProvider,
  getQuickDestinations,
  searchPlaces,
  fetchRoutesForTrip,
} from '../lib/routingService';

type DeparturePreset = 'now' | 'plus1h' | 'custom';

function getModeIcon(mode: RouteMode) {
  switch (mode) {
    case 'metro':
      return <Train className="w-4 h-4" />;
    case 'car':
      return <Car className="w-4 h-4" />;
    case 'two_wheeler':
      return <Bike className="w-4 h-4" />;
    case 'auto':
      return <Navigation className="w-4 h-4" />;
    case 'walk':
      return <Footprints className="w-4 h-4" />;
  }
}

function buildDepartureDate(preset: DeparturePreset, customTime: string): Date {
  const now = new Date();
  if (preset === 'now') return now;
  if (preset === 'plus1h') return new Date(now.getTime() + 60 * 60 * 1000);

  const [hh, mm] = (customTime || '14:30').split(':').map((n) => parseInt(n, 10));
  const custom = new Date(now);
  if (!isNaN(hh) && !isNaN(mm)) {
    custom.setHours(hh, mm, 0, 0);
    // If chosen time already passed today, move to tomorrow
    if (custom.getTime() < now.getTime() - 5 * 60 * 1000) {
      custom.setDate(custom.getDate() + 1);
    }
  }
  return custom;
}

export const RoutesPage: React.FC = () => {
  const { t } = useTranslation();
  const { pm25: livePm25, userProfile } = useAirQuality();

  const savedHome = useMemo(
    () =>
      userProfile?.location || {
        lat: 28.6139,
        lon: 77.209,
        name: 'Delhi NCR',
      },
    [userProfile]
  );

  const quickPresets = useMemo(() => getQuickDestinations(savedHome), [savedHome]);

  // Origin & destination state
  const [origin, setOrigin] = useState<PlaceSuggestion>(quickPresets.home);
  const [originInput, setOriginInput] = useState<string>(quickPresets.home.name);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);

  const [destination, setDestination] = useState<PlaceSuggestion | null>(quickPresets.office);
  const [destInput, setDestInput] = useState<string>(quickPresets.office.name);
  const [destSuggestions, setDestSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingTo, setIsSearchingTo] = useState<boolean>(false);

  // Departure timing
  const [departurePreset, setDeparturePreset] = useState<DeparturePreset>('now');
  const [customTime, setCustomTime] = useState<string>('14:30');

  // Map & routing state ('loading' waits until RouteMap resolves Google Maps vs Leaflet so we don't double-fetch)
  const [mapProvider, setMapProvider] = useState<'loading' | 'google' | 'leaflet'>('loading');
  const [routingProvider, setRoutingProvider] = useState<RoutingProvider>('osrm');
  const [evaluatedRoutes, setEvaluatedRoutes] = useState<EvaluatedRouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);
  const lastFetchKeyRef = useRef<string>('');
  const livePm25Ref = useRef<number>(livePm25 || 150);
  livePm25Ref.current = livePm25 || 150;

  // 48h forecast for departure timing tip strip
  const [forecastPoints, setForecastPoints] = useState<ForecastDataPoint[]>([]);

  // Sync origin when saved profile changes
  useEffect(() => {
    setOrigin(quickPresets.home);
    setOriginInput(quickPresets.home.name);
  }, [quickPresets.home.lat, quickPresets.home.lon, quickPresets.home.name]);

  // Fetch 48-hour forecast for origin to power the departure tip strip
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
    [departurePreset, customTime]
  );

  const departureTip = useMemo(
    () => computeDepartureTip(forecastPoints, departureDate, departurePreset === 'now'),
    [forecastPoints, departureDate, departurePreset]
  );

  // Main route + single-batch Open-Meteo exposure computation
  const computeRoutes = useCallback(
    async (orig: PlaceSuggestion, dest: PlaceSuggestion, depDate: Date, providerMode: 'google' | 'leaflet') => {
      setIsLoadingRoutes(true);
      try {
        const { routes, provider } = await fetchRoutesForTrip(
          { lat: orig.lat, lon: orig.lon },
          { lat: dest.lat, lon: dest.lon },
          depDate,
          providerMode === 'google'
        );
        setRoutingProvider(provider);

        // Sample 5 points per route and fetch ALL of them in ONE Open-Meteo batch request
        const sampledPerRoute = routes.map((r) => sampleRoutePoints(r.path, 5));
        const flattenedPoints = sampledPerRoute.flat();
        const fallbackPm = livePm25Ref.current;

        const pm25Values = await fetchRoutePointsPm25(
          flattenedPoints,
          depDate,
          fallbackPm
        );

        let offset = 0;
        const routeAvgPm25s = sampledPerRoute.map((pts) => {
          const slice = pm25Values.slice(offset, offset + pts.length);
          offset += pts.length;
          if (slice.length === 0) return fallbackPm;
          return slice.reduce((a, b) => a + b, 0) / slice.length;
        });

        const evaluated = evaluateRouteOptions(routes, routeAvgPm25s);
        setEvaluatedRoutes(evaluated);

        // Auto-select recommended option
        const rec = evaluated.find((r) => r.recommended) || evaluated[0];
        setSelectedRouteId(rec ? rec.id : null);
      } catch (err) {
        console.warn('[RoutesPage] Failed to compute routes:', err);
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    []
  );

  // Recompute once mapProvider resolves, and whenever origin, destination, or departure time changes
  useEffect(() => {
    if (!destination || mapProvider === 'loading') return;
    const fetchKey = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}|${departurePreset}|${departurePreset === 'custom' ? customTime : ''}|${mapProvider}`;
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;
    computeRoutes(origin, destination, departureDate, mapProvider);
  }, [
    origin,
    destination,
    departurePreset,
    customTime,
    departureDate,
    mapProvider,
    computeRoutes,
  ]);

  // Debounced search for Destination
  const handleDestSearch = async (query: string) => {
    setDestInput(query);
    if (query.trim().length < 2) {
      setDestSuggestions([]);
      return;
    }
    setIsSearchingTo(true);
    const hits = await searchPlaces(query, { lat: origin.lat, lon: origin.lon }, mapProvider === 'google');
    setDestSuggestions(hits);
    setIsSearchingTo(false);
  };

  // Search for Origin
  const handleOriginSearch = async (query: string) => {
    setOriginInput(query);
    if (query.trim().length < 2) {
      setOriginSuggestions([]);
      return;
    }
    const hits = await searchPlaces(query, { lat: savedHome.lat, lon: savedHome.lon }, mapProvider === 'google');
    setOriginSuggestions(hits);
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
    if (!departureTip) return;
    // Parse "2:00 PM" -> "14:00"
    const match = departureTip.bestTimeLabel.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return;
    let hh = parseInt(match[1], 10);
    const mm = match[2];
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    setCustomTime(`${hh.toString().padStart(2, '0')}:${mm}`);
    setDeparturePreset('custom');
  };

  const handleMapProviderChange = useCallback((p: 'google' | 'leaflet') => {
    setMapProvider(p);
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">
            {t('routes.title', 'Clean Routes')}
          </h2>
          <p className="text-xs text-slate-400">
            {t('routes.subtitle', 'Compare Metro, Car, Auto, Bike & Walk by smog exposure')}
          </p>
        </div>
        <Badge variant="mint" size="sm" className="whitespace-nowrap shrink-0">
          {routingProvider === 'google_routes'
            ? 'Google Routes'
            : routingProvider === 'osrm'
              ? 'OSRM (Fallback)'
              : 'Offline Estimate'}
        </Badge>
      </div>

      {/* Trip Inputs Card */}
      <GlassCard className="p-3.5 space-y-3 border-white/[0.1]">
        {/* From / To fields */}
        <div className="space-y-2">
          {/* FROM input */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:border-teal-400/50 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold w-9 shrink-0">
                From
              </span>
              <input
                type="text"
                value={originInput}
                onChange={(e) => handleOriginSearch(e.target.value)}
                placeholder="Starting point"
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none min-w-0"
              />
              {originInput !== quickPresets.home.name && (
                <button
                  type="button"
                  onClick={() => handleChipClick('home')}
                  className="text-[10px] text-teal-300 hover:text-teal-200 whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>

            {originSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 z-30 rounded-xl bg-[#0e1626] border border-white/15 shadow-2xl overflow-hidden">
                {originSuggestions.map((s, idx) => (
                  <button
                    key={`${s.lat}-${s.lon}-${idx}`}
                    type="button"
                    onClick={() => {
                      setOrigin(s);
                      setOriginInput(s.name);
                      setOriginSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-teal-500/15 flex items-center gap-2 border-b border-white/[0.05] last:border-none"
                  >
                    <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{s.name}</div>
                      {s.subtitle && <div className="text-[10px] text-slate-400 truncate">{s.subtitle}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TO input */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:border-amber-400/50 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold w-9 shrink-0">
                To
              </span>
              <input
                type="text"
                value={destInput}
                onChange={(e) => handleDestSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && destSuggestions.length > 0) {
                    const first = destSuggestions[0];
                    setDestination(first);
                    setDestInput(first.name);
                    setDestSuggestions([]);
                  }
                }}
                placeholder="Search destination (office, school, market...)"
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none min-w-0"
              />
              {isSearchingTo ? (
                <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin shrink-0" />
              ) : destInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setDestInput('');
                    setDestSuggestions([]);
                  }}
                  className="text-slate-500 hover:text-slate-300"
                  aria-label="Clear destination"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
            </div>

            {destSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 z-30 rounded-xl bg-[#0e1626] border border-white/15 shadow-2xl overflow-hidden">
                {destSuggestions.map((s, idx) => (
                  <button
                    key={`${s.lat}-${s.lon}-${idx}`}
                    type="button"
                    onClick={() => {
                      setDestination(s);
                      setDestInput(s.name);
                      setDestSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-teal-500/15 flex items-center gap-2 border-b border-white/[0.05] last:border-none"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{s.name}</div>
                      {s.subtitle && <div className="text-[10px] text-slate-400 truncate">{s.subtitle}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Destination Chips (Home / School / Office) + Departure Time */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleChipClick('home')}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.05] border border-white/[0.09] text-slate-200 hover:bg-teal-500/15 hover:border-teal-400/40 flex items-center gap-1 transition-colors"
            >
              <Home className="w-3 h-3 text-teal-400" />
              <span>Home</span>
            </button>
            <button
              type="button"
              onClick={() => handleChipClick('school')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                destination?.name === quickPresets.school.name
                  ? 'bg-teal-500/20 border-teal-400/50 text-teal-200'
                  : 'bg-white/[0.05] border-white/[0.09] text-slate-200 hover:bg-teal-500/15'
              }`}
            >
              <GraduationCap className="w-3 h-3 text-amber-400" />
              <span>School</span>
            </button>
            <button
              type="button"
              onClick={() => handleChipClick('office')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                destination?.name === quickPresets.office.name
                  ? 'bg-teal-500/20 border-teal-400/50 text-teal-200'
                  : 'bg-white/[0.05] border-white/[0.09] text-slate-200 hover:bg-teal-500/15'
              }`}
            >
              <Briefcase className="w-3 h-3 text-indigo-300" />
              <span>Office</span>
            </button>
          </div>

          {/* Departure Time Selector */}
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-full p-0.5">
            {(['now', 'plus1h', 'custom'] as DeparturePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDeparturePreset(preset)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                  departurePreset === preset
                    ? 'bg-teal-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {preset === 'now' ? 'Now' : preset === 'plus1h' ? '+1h' : 'Custom'}
              </button>
            ))}
          </div>
        </div>

        {/* Custom time picker row */}
        {departurePreset === 'custom' && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>Departure time</span>
            </span>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="bg-[#0B0F17] border border-white/15 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-teal-400"
            />
          </div>
        )}
      </GlassCard>

      {/* 48-Hour Forecast Departure Tip Strip */}
      {departureTip && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-teal-500/15 to-emerald-500/10 border border-teal-400/30 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-teal-300 shrink-0" />
            <span className="text-xs text-teal-100 font-medium leading-snug">
              {departureTip.message}
            </span>
          </div>
          <button
            type="button"
            onClick={handleApplyTipTime}
            className="px-2.5 py-1 rounded-lg bg-teal-400/20 border border-teal-400/40 text-[10px] font-semibold text-teal-200 hover:bg-teal-400/30 whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <span>Use</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Interactive Exposure Map (Google Maps with automatic Leaflet + OSM fallback) */}
      <RouteMap
        origin={{ lat: origin.lat, lon: origin.lon }}
        destination={destination ? { lat: destination.lat, lon: destination.lon } : null}
        routes={evaluatedRoutes}
        selectedRouteId={selectedRouteId}
        onSelectRoute={setSelectedRouteId}
        onMapProviderChange={handleMapProviderChange}
      />

      {/* Mode Comparison Cards */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Route & Mode Exposure Comparison
          </h3>
          {isLoadingRoutes && (
            <span className="text-[11px] text-teal-300 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Sampling PM2.5…
            </span>
          )}
        </div>

        {evaluatedRoutes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const badgeVariant =
            route.exposureLevel === 'clean'
              ? 'mint'
              : route.exposureLevel === 'moderate'
                ? 'warning'
                : 'danger';

          return (
            <GlassCard
              key={route.id}
              onClick={() => setSelectedRouteId(route.id)}
              className={`relative overflow-hidden p-3.5 cursor-pointer transition-all space-y-2.5 ${
                isSelected
                  ? 'border-teal-400/50 bg-teal-500/[0.07] shadow-lg shadow-teal-500/10'
                  : 'border-white/[0.08] hover:border-white/20'
              }`}
            >
              {/* Recommended Ribbon with Reason */}
              {route.recommended && (
                <div className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-400 text-slate-950 text-[10px] font-bold tracking-wide shadow-md">
                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                  <span>
                    Recommended · {route.recommendedReason || 'cleanest for you and the city'}
                  </span>
                </div>
              )}

              {/* Header Row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: `${route.strokeColor}1A`,
                      borderColor: `${route.strokeColor}55`,
                      color: route.strokeColor,
                    }}
                  >
                    {getModeIcon(route.mode)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white">{route.label}</span>
                      {route.isEstimate && (
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/10">
                          estimate
                        </span>
                      )}
                      {route.isAlternative && (
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-400/30">
                          alt
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {route.summary || `${route.distanceKm} km`} · avg {route.avgPm25} µg/m³
                    </p>
                  </div>
                </div>
              </div>

              {/* Relative Smog Bar & Comparison */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={badgeVariant} size="sm" className="font-mono whitespace-nowrap">
                      <Cigarette className="w-3 h-3 mr-1 inline" />
                      {route.cigarettes.toFixed(2)} cigs
                    </Badge>
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: route.strokeColor }}
                    >
                      {route.relativeSmogLabel}
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${route.smogBarPercent}%`,
                      backgroundColor: route.strokeColor,
                    }}
                  />
                </div>
              </div>

              {/* Metrics Row: Time · Distance · CO2 */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.06]">
                <div className="bg-white/[0.03] rounded-xl px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Time
                  </div>
                  <div className="text-xs font-numbers font-bold text-white mt-0.5">
                    {route.durationMin} min
                  </div>
                </div>

                <div className="bg-white/[0.03] rounded-xl px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-slate-400" /> Distance
                  </div>
                  <div className="text-xs font-numbers font-bold text-slate-200 mt-0.5">
                    {route.distanceKm} km
                  </div>
                </div>

                <div className="bg-white/[0.03] rounded-xl px-2.5 py-1.5">
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Leaf className="w-3 h-3 text-emerald-400" /> CO₂
                  </div>
                  <div className="text-xs font-numbers font-bold text-slate-200 mt-0.5">
                    {route.co2Kg === 0 ? '0 kg' : `${route.co2Kg.toFixed(2)} kg`}
                  </div>
                </div>
              </div>

              {/* Metro Google Maps Transit Deep-Link Button */}
              {route.mode === 'metro' && route.transitUrl && (
                <div className="pt-1">
                  <a
                    href={route.transitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full py-2 px-3 rounded-xl bg-teal-400/15 hover:bg-teal-400/25 border border-teal-400/40 text-teal-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Train className="w-3.5 h-3.5" />
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};

export default RoutesPage;
