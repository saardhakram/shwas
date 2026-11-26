import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Sparkles, Wind } from 'lucide-react';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import FamilyChips, { type FamilyMemberOption } from '../ui/FamilyChips';
import Badge from '../ui/Badge';
import type { getAtmosphereGradient } from './atmosphere';

interface AppHeaderProps {
  cityName: string;
  aqi: number;
  atmosphere: ReturnType<typeof getAtmosphereGradient>;
  selectedFamilyId: string;
  familyChips: FamilyMemberOption[];
  onToggleDemoAqi: () => void;
  onSelectFamily: (id: string) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  cityName,
  aqi,
  atmosphere,
  selectedFamilyId,
  familyChips,
  onToggleDemoAqi,
  onSelectFamily,
}) => {
  const { t } = useTranslation();
  return (
    <header className="flex flex-col gap-3 pb-3 border-b border-white/[0.06] mb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-sm shadow-teal-500/20 shrink-0"
          >
            <Wind className="w-4 h-4 animate-pulse-subtle" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-display font-bold text-base tracking-tight text-white">
                Shwas
              </span>
              <span className="text-[11px] font-normal text-teal-400/80" aria-hidden="true">
                श्वास
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider truncate max-w-[120px] inline-block">
              {cityName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDemoAqi}
            title={t(
              'app.toggleDemoTitle',
              'Click to toggle between Severe Smog and Clean Dawn Teal demo atmosphere',
            )}
            aria-label={t(
              'app.toggleDemoAria',
              'Current AQI {{aqi}}, {{label}}. Activate to preview severe vs clean air atmosphere',
              { aqi, label: atmosphere.label },
            )}
            className="group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Badge
              variant={atmosphere.badgeVariant}
              size="sm"
              icon={
                aqi >= 300 ? (
                  <ShieldAlert className="w-3 h-3 text-red-400" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3 h-3 text-teal-300" aria-hidden="true" />
                )
              }
              className="cursor-pointer transition-transform group-hover:scale-105 font-mono"
            >
              {aqi} {atmosphere.label}
            </Badge>
          </button>

          <LanguageSwitcher />
        </div>
      </div>

      <FamilyChips selectedId={selectedFamilyId} onSelect={onSelectFamily} members={familyChips} />
    </header>
  );
};
