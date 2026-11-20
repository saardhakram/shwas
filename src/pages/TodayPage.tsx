import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cigarette,
  ArrowRight,
  Sparkles,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import { useAirQuality } from '../components/layout/AppLayout';

export const TodayPage: React.FC = () => {
  const { t } = useTranslation();
  const { aqi, selectedFamilyId } = useAirQuality();

  // Cigarette calculations for Delhi winter benchmark:
  // Base day: ~8.9 cigarettes (rounded 9)
  // With plan: ~5.0 cigarettes
  // Saved: 4 cigarettes
  const currentCigarettes = selectedFamilyId === 'grandpa' ? 10.4 : selectedFamilyId === 'child' ? 7.6 : 8.9;
  const targetCigarettes = selectedFamilyId === 'grandpa' ? 5.8 : selectedFamilyId === 'child' ? 4.2 : 5.0;
  const cigarettesSaved = (currentCigarettes - targetCigarettes).toFixed(1);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Hero Cigarette Card */}
      <GlassCard className="relative overflow-hidden text-center py-6 px-4 border-white/[0.1] bg-gradient-to-b from-[#182030]/80 to-[#101624]/90">
        <div className="absolute top-3 right-3">
          <Badge variant="mint" size="sm" icon={<TrendingDown className="w-3 h-3" />}>
            -{cigarettesSaved} {t('today.heroCigarettes', 'cigs')}
          </Badge>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-medium mb-1">
          <Cigarette className="w-4 h-4 text-amber-400" />
          <span>{t('today.heroSubtitle', 'breathed today across your routine')}</span>
        </div>

        {/* Hero Number in Space Grotesk */}
        <div className="flex items-baseline justify-center gap-2 my-2">
          <span className="font-numbers text-6xl font-bold tracking-tight text-white drop-shadow-md">
            {Math.round(currentCigarettes)}
          </span>
          <span className="font-sans text-lg text-slate-300 font-medium">
            {t('today.heroCigarettes', 'cigarettes')}
          </span>
        </div>

        {/* Plan Impact Arc Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-medium mt-1">
          <Sparkles className="w-3.5 h-3.5 text-teal-400" />
          <span>
            {Math.round(currentCigarettes)} <ArrowRight className="w-3 h-3 inline mx-0.5 text-teal-400" /> {Math.round(targetCigarettes)} {t('today.targetPlan', { target: `${Math.round(targetCigarettes)}`, defaultValue: 'if you follow your plan' })}
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span>Station AQI: <strong className="text-slate-200 font-numbers">{aqi}</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-amber-400/80" />
            <span>{t('app.disclaimer', 'Awareness estimate, not a medical measurement.')}</span>
          </div>
        </div>
      </GlassCard>

      {/* 48-Hour ML Forecast Card Placeholder */}
      <GlassCard className="border-white/[0.08] bg-[#121927]/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              {t('today.forecastTitle', 'Shwas 48-Hour Forecast (ML)')}
            </h3>
          </div>
          <Badge variant="mint" size="sm">
            ML
          </Badge>
        </div>

        <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center gap-2.5 my-2">
          <Clock className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs text-teal-200 font-medium">
            {t('today.forecastBestWindow', 'Best air window: 2:00 PM – 4:30 PM')}
          </span>
        </div>

        <div className="h-16 flex items-end justify-between gap-1 pt-3 px-1">
          {/* Visual mini bars representing hourly PM2.5 forecast curve */}
          {[180, 240, 310, 340, 280, 160, 120, 140, 210, 290, 320, 300].map((val, idx) => {
            const heightPct = Math.round((val / 350) * 100);
            const isBest = idx >= 5 && idx <= 7;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t-sm transition-all duration-300 ${
                    isBest
                      ? 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]'
                      : val > 250
                      ? 'bg-red-500/50'
                      : 'bg-amber-500/50'
                  }`}
                  title={`${val} µg/m³`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>6 AM</span>
          <span className="text-teal-300 font-medium">Best (2-4 PM)</span>
          <span>10 PM</span>
        </div>
      </GlassCard>

      {/* Today's Air Plan Timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('today.planTimeline', "Today's Air Plan Timeline")}
          </h3>
          <span className="text-[11px] text-teal-300 font-medium">
            Save 4 cigs today
          </span>
        </div>

        {/* Empty / Foundation sample plan items */}
        <div className="space-y-2">
          <GlassCard variant="mint" className="flex items-start gap-3 p-3">
            <CheckCircle2 className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-100">
                  Keep balcony windows shut during morning commute peak
                </h4>
                <Badge variant="mint" size="sm">
                  -1.4 cigs
                </Badge>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                Heavy truck & car exhaust on ring road between 7:30 – 10:00 AM.
              </p>
            </div>
          </GlassCard>

          <GlassCard variant="subtle" className="flex items-start gap-3 p-3">
            <div className="w-5 h-5 rounded-full border border-teal-500/40 flex items-center justify-center mt-0.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-200">
                  Airing & cross-ventilation window (2:00 PM – 3:30 PM)
                </h4>
                <Badge variant="neutral" size="sm">
                  -0.8 cigs
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Sun warms atmospheric boundary layer, dispersing local smog plume.
              </p>
            </div>
          </GlassCard>

          <GlassCard variant="subtle" className="flex items-start gap-3 p-3">
            <div className="w-5 h-5 rounded-full border border-teal-500/40 flex items-center justify-center mt-0.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-200">
                  Take Yellow Line Metro instead of Outer Ring Road auto
                </h4>
                <Badge variant="mint" size="sm">
                  -1.2 cigs
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Underground filtered air cabin reduces peak transit exposure.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default TodayPage;
