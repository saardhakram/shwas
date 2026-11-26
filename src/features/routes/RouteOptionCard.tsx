import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bike,
  Car,
  Cigarette,
  Clock,
  ExternalLink,
  Footprints,
  Leaf,
  Navigation,
  Sparkles,
  Train,
} from 'lucide-react';
import Badge from '../../components/ui/Badge';
import type { EvaluatedRouteOption, RouteMode } from '../../lib/routeExposure';

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

const RouteMetricsRow: React.FC<{ route: EvaluatedRouteOption }> = ({ route }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.08]">
      <div className="bg-white/[0.04] rounded-xl px-2.5 py-1.5">
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" /> {t('routes.timeLabel', 'Time')}
        </div>
        <div className="text-xs font-numbers font-bold text-white mt-0.5">
          {route.durationMin} {t('app.units.min', 'min')}
        </div>
      </div>

      <div className="bg-white/[0.04] rounded-xl px-2.5 py-1.5">
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Navigation className="w-3 h-3 text-slate-400" aria-hidden="true" />{' '}
          {t('routes.distanceLabel', 'Distance')}
        </div>
        <div className="text-xs font-numbers font-bold text-slate-200 mt-0.5">
          {route.distanceKm} {t('app.units.km', 'km')}
        </div>
      </div>

      <div className="bg-white/[0.04] rounded-xl px-2.5 py-1.5">
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Leaf className="w-3 h-3 text-emerald-400" aria-hidden="true" />{' '}
          {t('routes.co2Label', 'CO₂')}
        </div>
        <div className="text-xs font-numbers font-bold text-slate-200 mt-0.5">
          {route.co2Kg === 0 ? '0' : route.co2Kg.toFixed(2)} {t('app.units.kg', 'kg')}
        </div>
      </div>
    </div>
  );
};

interface RouteOptionCardProps {
  route: EvaluatedRouteOption;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const RouteOptionCard: React.FC<RouteOptionCardProps> = ({
  route,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const badgeVariant =
    route.exposureLevel === 'clean'
      ? 'mint'
      : route.exposureLevel === 'moderate'
        ? 'warning'
        : 'danger';

  return (
    <div
      className={`relative rounded-2xl p-3.5 transition-colors space-y-2.5 border ${
        isSelected
          ? 'bg-surface-selected border-teal-400/60 shadow-lg shadow-teal-500/10'
          : 'bg-surface-card/95 border-white/[0.1] hover:border-white/25'
      }`}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={t(
          'routes.optionAria',
          '{{label}}, {{cigs}} cigarettes, {{min}} minutes, {{co2}} kg CO2',
          {
            label: route.label,
            cigs: route.cigarettes.toFixed(2),
            min: route.durationMin,
            co2: route.co2Kg.toFixed(2),
          },
        )}
        onClick={() => onSelect(route.id)}
        className="w-full text-left space-y-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-xl"
      >
        {route.recommended && (
          <div className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-400 text-slate-950 text-[10px] font-bold tracking-wide shadow-md">
            <Sparkles className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
            <span>
              {t('routes.recommendedPrefix', 'Recommended · {{reason}}', {
                reason:
                  route.recommendedReason ||
                  t('routes.reasonMetro', 'cleanest for you and the city'),
              })}
            </span>
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              aria-hidden="true"
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
                    {t('routes.estimateBadge', 'estimate')}
                  </span>
                )}
                {route.isAlternative && (
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-400/30">
                    {t('routes.altBadge', 'alt')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {route.summary || `${route.distanceKm} ${t('app.units.km', 'km')}`} ·{' '}
                {t('routes.avgPm25', 'avg {{pm25}} µg/m³', { pm25: route.avgPm25 })}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={badgeVariant} size="sm" className="font-mono whitespace-nowrap">
                <Cigarette className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                {route.cigarettes.toFixed(2)} {t('app.units.cigs', 'cigs')}
              </Badge>
              <span className="text-[11px] font-medium" style={{ color: route.strokeColor }}>
                {route.relativeSmogLabel}
              </span>
            </div>
          </div>
          <div
            className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${route.smogBarPercent}%`, backgroundColor: route.strokeColor }}
            />
          </div>
        </div>

        <RouteMetricsRow route={route} />
      </button>

      {route.mode === 'metro' && route.transitUrl && (
        <div className="pt-1">
          <a
            href={route.transitUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('routes.openInMaps', 'Open in Google Maps')}
            className="w-full py-2 px-3 rounded-xl bg-teal-400/15 hover:bg-teal-400/25 border border-teal-400/40 text-teal-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Train className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('routes.openInMaps', 'Open in Google Maps')}</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
};
