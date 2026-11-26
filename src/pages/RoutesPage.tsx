import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import Badge from '../components/ui/Badge';
import RouteMap from '../components/routes/RouteMap';
import { useCleanRoutes } from '../features/routes/useCleanRoutes';
import { TripSearchCard } from '../features/routes/TripSearchCard';
import { RouteOptionCard } from '../features/routes/RouteOptionCard';

export const RoutesPage: React.FC = () => {
  const { t } = useTranslation();
  const r = useCleanRoutes();

  const providerBadgeLabel =
    r.routingProvider === 'google_routes'
      ? 'Google Routes'
      : r.routingProvider === 'osrm'
        ? 'OSRM (Fallback)'
        : 'Offline Estimate';

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">
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
          {providerBadgeLabel}
        </Badge>
      </div>

      <TripSearchCard
        quickPresets={r.quickPresets}
        originInput={r.originInput}
        originSuggestions={r.originSuggestions}
        destination={r.destination}
        destInput={r.destInput}
        destSuggestions={r.destSuggestions}
        isSearchingTo={r.isSearchingTo}
        departurePreset={r.departurePreset}
        customTime={r.customTime}
        onOriginSearch={r.handleOriginSearch}
        onSelectOrigin={(s) => {
          r.setOrigin(s);
          r.setOriginInput(s.name);
          r.setOriginSuggestions([]);
        }}
        onDestSearch={r.handleDestSearch}
        onSelectDest={(s) => {
          r.setDestination(s);
          r.setDestInput(s.name);
          r.setDestSuggestions([]);
        }}
        onClearDest={() => {
          r.setDestInput('');
          r.setDestSuggestions([]);
        }}
        onChipClick={r.handleChipClick}
        onDeparturePresetChange={r.setDeparturePreset}
        onCustomTimeChange={r.setCustomTime}
      />

      {r.departureTip && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-teal-500/15 to-emerald-500/10 border border-teal-400/30 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
            <span className="text-xs text-teal-100 font-medium leading-snug">
              {r.departureTip.message}
            </span>
          </div>
          <button
            type="button"
            onClick={r.handleApplyTipTime}
            aria-label={`Set departure time to ${r.departureTip.bestTimeLabel}`}
            className="px-2.5 py-1 rounded-lg bg-teal-400/20 border border-teal-400/40 text-[10px] font-semibold text-teal-200 hover:bg-teal-400/30 whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <span>Use</span>
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      )}

      <RouteMap
        origin={{ lat: r.origin.lat, lon: r.origin.lon }}
        destination={r.destination ? { lat: r.destination.lat, lon: r.destination.lon } : null}
        routes={r.evaluatedRoutes}
        selectedRouteId={r.selectedRouteId}
        onSelectRoute={r.setSelectedRouteId}
        onMapProviderChange={r.handleMapProviderChange}
      />

      <div className="space-y-2.5 relative z-10">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('routes.comparisonHeading', 'Route & Mode Exposure Comparison')}
          </h3>
          {r.isLoadingRoutes && (
            <span className="text-[11px] text-teal-300 flex items-center gap-1.5" role="status">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Sampling PM2.5…
            </span>
          )}
        </div>

        {r.routeError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-200"
          >
            {r.routeError}
          </div>
        )}

        {r.isLoadingRoutes && r.evaluatedRoutes.length === 0 && (
          <div className="space-y-2.5" aria-label="Loading route options">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="h-28 rounded-2xl bg-[#131b2c]/90 border border-white/[0.08] animate-pulse"
              />
            ))}
          </div>
        )}

        {r.evaluatedRoutes.map((route) => (
          <RouteOptionCard
            key={route.id}
            route={route}
            isSelected={route.id === r.selectedRouteId}
            onSelect={r.setSelectedRouteId}
          />
        ))}
      </div>
    </div>
  );
};

export default RoutesPage;
