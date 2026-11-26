import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, X } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import type { PlaceSuggestion } from '../../lib/routingService';
import type { DeparturePreset } from './routeTimeHelpers';
import {
  DeparturePresetControl,
  QuickDestinationChips,
  SuggestionDropdown,
} from './TripSearchControls';

interface TripSearchCardProps {
  quickPresets: { home: PlaceSuggestion; school: PlaceSuggestion; office: PlaceSuggestion };
  originInput: string;
  originSuggestions: PlaceSuggestion[];
  destination: PlaceSuggestion | null;
  destInput: string;
  destSuggestions: PlaceSuggestion[];
  isSearchingTo: boolean;
  departurePreset: DeparturePreset;
  customTime: string;
  onOriginSearch: (q: string) => void;
  onSelectOrigin: (s: PlaceSuggestion) => void;
  onDestSearch: (q: string) => void;
  onSelectDest: (s: PlaceSuggestion) => void;
  onClearDest: () => void;
  onChipClick: (chip: 'home' | 'school' | 'office') => void;
  onDeparturePresetChange: (preset: DeparturePreset) => void;
  onCustomTimeChange: (time: string) => void;
}

export const TripSearchCard: React.FC<TripSearchCardProps> = ({
  quickPresets,
  originInput,
  originSuggestions,
  destination,
  destInput,
  destSuggestions,
  isSearchingTo,
  departurePreset,
  customTime,
  onOriginSearch,
  onSelectOrigin,
  onDestSearch,
  onSelectDest,
  onClearDest,
  onChipClick,
  onDeparturePresetChange,
  onCustomTimeChange,
}) => {
  const { t } = useTranslation();

  return (
    <GlassCard className="p-3.5 space-y-3 border-white/[0.1]">
      <div className="space-y-2">
        <div className="relative">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:border-teal-400/50 transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" aria-hidden="true" />
            <label
              htmlFor="routes-origin-input"
              className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold w-9 shrink-0"
            >
              {t('routes.from', 'From')}
            </label>
            <input
              id="routes-origin-input"
              type="text"
              value={originInput}
              onChange={(e) => onOriginSearch(e.target.value)}
              placeholder={t('routes.startingPointPlaceholder', 'Starting point')}
              aria-label={t('routes.originAria', 'Origin starting point')}
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none min-w-0"
            />
            {originInput !== quickPresets.home.name && (
              <button
                type="button"
                onClick={() => onChipClick('home')}
                aria-label={t('routes.resetOriginAria', 'Reset origin to saved home')}
                className="text-[10px] text-teal-300 hover:text-teal-200 whitespace-nowrap"
              >
                {t('routes.reset', 'Reset')}
              </button>
            )}
          </div>
          <SuggestionDropdown
            suggestions={originSuggestions}
            pinColorClass="text-teal-400"
            onSelect={onSelectOrigin}
          />
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:border-amber-400/50 transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
            <label
              htmlFor="routes-dest-input"
              className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold w-9 shrink-0"
            >
              {t('routes.to', 'To')}
            </label>
            <input
              id="routes-dest-input"
              type="text"
              value={destInput}
              onChange={(e) => onDestSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && destSuggestions.length > 0) {
                  onSelectDest(destSuggestions[0]);
                }
              }}
              placeholder={t(
                'routes.searchPlaceholder',
                'Search destination (office, school, market...)',
              )}
              aria-label={t('routes.destinationAria', 'Destination address')}
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none min-w-0"
            />
            {isSearchingTo ? (
              <Loader2
                className="w-3.5 h-3.5 text-teal-400 animate-spin shrink-0"
                aria-hidden="true"
              />
            ) : destInput ? (
              <button
                type="button"
                onClick={onClearDest}
                className="text-slate-500 hover:text-slate-300"
                aria-label={t('routes.clearDestAria', 'Clear destination')}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            )}
          </div>
          <SuggestionDropdown
            suggestions={destSuggestions}
            pinColorClass="text-amber-400"
            onSelect={onSelectDest}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <QuickDestinationChips
          quickPresets={quickPresets}
          destination={destination}
          onChipClick={onChipClick}
        />

        <DeparturePresetControl
          departurePreset={departurePreset}
          customTime={customTime}
          onDeparturePresetChange={onDeparturePresetChange}
          onCustomTimeChange={onCustomTimeChange}
        />
      </div>
    </GlassCard>
  );
};
