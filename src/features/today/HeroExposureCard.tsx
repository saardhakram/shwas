import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, Cigarette, Sparkles, TrendingDown } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Badge from '../../components/ui/Badge';

interface HeroExposureCardProps {
  selectedFamilyId: string;
  animatedExposure: number;
  baseCigarettes: number;
  targetCigarettes: number;
  totalPotentialSavings: number;
  locationName: string;
  aqi: number;
}

export const HeroExposureCard: React.FC<HeroExposureCardProps> = ({
  selectedFamilyId,
  animatedExposure,
  baseCigarettes,
  targetCigarettes,
  totalPotentialSavings,
  locationName,
  aqi,
}) => {
  const { t } = useTranslation();

  return (
    <GlassCard className="relative overflow-hidden py-5 px-4 border-white/[0.1] bg-gradient-to-b from-[#182030]/80 to-[#101624]/90">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium min-w-0">
          <Cigarette className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {selectedFamilyId === 'all'
              ? t('today.familyAverage', 'per person (family average)')
              : t('today.heroSubtitle', 'breathed today across your routine')}
          </span>
        </div>

        {totalPotentialSavings > 0.0 && (
          <Badge
            variant="mint"
            size="sm"
            icon={<TrendingDown className="w-3 h-3" aria-hidden="true" />}
            className="shrink-0 whitespace-nowrap"
          >
            -{totalPotentialSavings.toFixed(1)} {t('today.heroCigarettes', 'cigs')}
          </Badge>
        )}
      </div>

      <div className="flex items-baseline justify-center gap-2 my-2.5">
        <span className="font-numbers text-6xl font-bold tracking-tight text-white drop-shadow-md transition-all">
          {animatedExposure.toFixed(1)}
        </span>
        <span className="font-sans text-lg text-slate-300 font-medium">
          {t('today.heroCigarettes', 'cigarettes')}
        </span>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap flex items-center gap-1.5">
            <span>{baseCigarettes.toFixed(1)}</span>
            <ArrowRight className="w-3 h-3 text-teal-400 inline shrink-0" aria-hidden="true" />
            <span>{targetCigarettes.toFixed(1)}</span>
            <span>{t('today.targetPlan', 'if you follow your plan')}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
          <span className="whitespace-nowrap">
            {locationName} AQI: <strong className="text-slate-200 font-numbers">{aqi}</strong>
          </span>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <AlertCircle className="w-3 h-3 text-amber-400/80 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {t('app.disclaimer', 'Awareness estimate, not a medical measurement.')}
          </span>
        </div>
      </div>
    </GlassCard>
  );
};
