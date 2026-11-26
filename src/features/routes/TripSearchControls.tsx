import React from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, Clock, GraduationCap, Home, MapPin } from 'lucide-react';
import type { PlaceSuggestion } from '../../lib/routingService';
import type { DeparturePreset } from './routeTimeHelpers';

const DEPARTURE_PRESETS: DeparturePreset[] = ['now', 'plus1h', 'custom'];

export const SuggestionDropdown: React.FC<{
  suggestions: PlaceSuggestion[];
  pinColorClass: string;
  onSelect: (s: PlaceSuggestion) => void;
}> = ({ suggestions, pinColorClass, onSelect }) => {
  if (suggestions.length === 0) return null;
  return (
    <div className="absolute left-0 right-0 mt-1 z-30 rounded-xl bg-surface-popover border border-white/15 shadow-2xl overflow-hidden">
      {suggestions.map((s, idx) => (
        <button
          key={`${s.lat}-${s.lon}-${idx}`}
          type="button"
          onClick={() => onSelect(s)}
          className="w-full text-left px-3 py-2 text-xs hover:bg-teal-500/15 flex items-center gap-2 border-b border-white/[0.05] last:border-none"
        >
          <MapPin className={`w-3.5 h-3.5 shrink-0 ${pinColorClass}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-white font-medium truncate">{s.name}</div>
            {s.subtitle && <div className="text-[10px] text-slate-400 truncate">{s.subtitle}</div>}
          </div>
        </button>
      ))}
    </div>
  );
};

export const QuickDestinationChips: React.FC<{
  quickPresets: { home: PlaceSuggestion; school: PlaceSuggestion; office: PlaceSuggestion };
  destination: PlaceSuggestion | null;
  onChipClick: (chip: 'home' | 'school' | 'office') => void;
}> = ({ quickPresets, destination, onChipClick }) => {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label={t('routes.quickPresetsAria', 'Quick place presets')}
    >
      <button
        type="button"
        onClick={() => onChipClick('home')}
        aria-label={t('routes.setOriginHomeAria', 'Set starting point to Home')}
        className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.05] border border-white/[0.09] text-slate-200 hover:bg-teal-500/15 hover:border-teal-400/40 flex items-center gap-1 transition-colors"
      >
        <Home className="w-3 h-3 text-teal-400" aria-hidden="true" />
        <span>{t('routes.home', 'Home')}</span>
      </button>
      <button
        type="button"
        onClick={() => onChipClick('school')}
        aria-pressed={destination?.name === quickPresets.school.name}
        aria-label={t('routes.setDestSchoolAria', 'Set destination to School')}
        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-colors ${
          destination?.name === quickPresets.school.name
            ? 'bg-teal-500/20 border-teal-400/50 text-teal-200'
            : 'bg-white/[0.05] border-white/[0.09] text-slate-200 hover:bg-teal-500/15'
        }`}
      >
        <GraduationCap className="w-3 h-3 text-amber-400" aria-hidden="true" />
        <span>{t('routes.school', 'School')}</span>
      </button>
      <button
        type="button"
        onClick={() => onChipClick('office')}
        aria-pressed={destination?.name === quickPresets.office.name}
        aria-label={t('routes.setDestOfficeAria', 'Set destination to Office')}
        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1 transition-colors ${
          destination?.name === quickPresets.office.name
            ? 'bg-teal-500/20 border-teal-400/50 text-teal-200'
            : 'bg-white/[0.05] border-white/[0.09] text-slate-200 hover:bg-teal-500/15'
        }`}
      >
        <Briefcase className="w-3 h-3 text-indigo-300" aria-hidden="true" />
        <span>{t('routes.office', 'Office')}</span>
      </button>
    </div>
  );
};

export const DeparturePresetControl: React.FC<{
  departurePreset: DeparturePreset;
  customTime: string;
  onDeparturePresetChange: (preset: DeparturePreset) => void;
  onCustomTimeChange: (time: string) => void;
}> = ({ departurePreset, customTime, onDeparturePresetChange, onCustomTimeChange }) => {
  const { t } = useTranslation();
  return (
    <>
      <div
        role="group"
        aria-label={t('routes.departurePresetAria', 'Departure time preset')}
        className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-full p-0.5"
      >
        {DEPARTURE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={departurePreset === preset}
            onClick={() => onDeparturePresetChange(preset)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
              departurePreset === preset
                ? 'bg-teal-400 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {preset === 'now'
              ? t('routes.now', 'Now')
              : preset === 'plus1h'
                ? '+1h'
                : t('routes.custom', 'Custom')}
          </button>
        ))}
      </div>

      {departurePreset === 'custom' && (
        <div className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs mt-1">
          <label htmlFor="routes-custom-time" className="text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
            <span>{t('routes.departureTimeLabel', 'Departure time')}</span>
          </label>
          <input
            id="routes-custom-time"
            type="time"
            value={customTime}
            onChange={(e) => onCustomTimeChange(e.target.value)}
            aria-label={t('routes.customDepartureAria', 'Custom departure time')}
            className="bg-surface-base border border-white/15 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-teal-400"
          />
        </div>
      )}
    </>
  );
};
