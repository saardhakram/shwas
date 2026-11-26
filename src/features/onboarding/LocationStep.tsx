import React, { type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Navigation, Search } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import GlassCard from '../../components/ui/GlassCard';
import type { ProfileLocation } from '../../types';
import { POPULAR_CITIES } from './useOnboarding';

interface LocationStepProps {
  location: ProfileLocation;
  searchQuery: string;
  searchResults: ProfileLocation[];
  isSearching: boolean;
  isLocating: boolean;
  onLocationChange: (loc: ProfileLocation) => void;
  onSearchQueryChange: (q: string) => void;
  onClearSearchResults: () => void;
  onUseMyLocation: () => void;
  onSearchCity: (e: FormEvent) => void;
}

export const LocationStep: React.FC<LocationStepProps> = ({
  location,
  searchQuery,
  searchResults,
  isSearching,
  isLocating,
  onLocationChange,
  onSearchQueryChange,
  onClearSearchResults,
  onUseMyLocation,
  onSearchCity,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <Badge variant="mint" size="sm" className="mb-1">
          {t('onboarding.stepOf', 'Step {{step}} of 5', { step: 2 })}
        </Badge>
        <h2 className="text-xl font-bold font-display text-white">
          {t('onboarding.locTitle', 'Where does your family live?')}
        </h2>
        <p className="text-xs text-slate-400">
          {t(
            'onboarding.locSubtitle',
            'Pollution levels change street by street. We use live satellite and station data.',
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onUseMyLocation}
        disabled={isLocating}
        className="w-full py-3 px-4 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-teal-500/25 transition-all shadow-sm shadow-teal-500/20"
      >
        <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span>
          {isLocating
            ? t('onboarding.locatingGps', 'Locating with GPS...')
            : t('onboarding.useCurrentLocation', 'Use My Current Location')}
        </span>
      </button>

      <form onSubmit={onSearchCity} className="relative">
        <label htmlFor="onboarding-city-search" className="sr-only">
          {t('onboarding.searchCityLabel', 'Search city, town or area in India')}
        </label>
        <input
          id="onboarding-city-search"
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder={t(
            'onboarding.searchCityPlaceholder',
            'Search city, town or area in India...',
          )}
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/60"
        />
        <button
          type="submit"
          disabled={isSearching}
          aria-label={t('onboarding.searchCityAria', 'Search city')}
          className="absolute right-2 top-2 p-1 text-slate-400 hover:text-teal-300"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="bg-surface-elevated border border-white/10 rounded-xl p-1 space-y-1 shadow-2xl">
          {searchResults.map((res, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onLocationChange(res);
                onClearSearchResults();
                onSearchQueryChange(res.name);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-teal-500/20 hover:text-teal-300 flex items-center justify-between"
            >
              <span>{res.name}</span>
              <MapPin className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-1">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {t('onboarding.popularCities', 'Popular Cities')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_CITIES.map((city) => {
            const isSelected = location.name === city.name;
            return (
              <button
                key={city.name}
                type="button"
                onClick={() => onLocationChange(city)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-sm shadow-teal-500/20'
                    : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08]'
                }`}
              >
                {city.name}
              </button>
            );
          })}
        </div>
      </div>

      <GlassCard variant="mint" className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal-400" aria-hidden="true" />
          <span className="text-xs font-semibold text-white">
            {t('onboarding.selectedLocation', 'Selected: {{name}}', { name: location.name })}
          </span>
        </div>
        <Badge variant="mint" size="sm">
          {t('onboarding.ready', 'Ready')}
        </Badge>
      </GlassCard>
    </div>
  );
};
