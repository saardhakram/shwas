import React from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Navigation, Train, Car } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';

export const RoutesPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">
            {t('routes.title', 'Clean Routes')}
          </h2>
          <p className="text-xs text-slate-400">
            {t('routes.subtitle', 'Compare Metro, Auto, Walk & Bike by pollution exposure')}
          </p>
        </div>
        <Badge variant="mint" size="sm">Exposure Routing</Badge>
      </div>

      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Navigation className="w-4 h-4 text-teal-400" />
          <span>Trip Comparison Preview</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30">
            <div className="flex items-center gap-1.5 text-teal-300 font-semibold mb-1">
              <Train className="w-4 h-4" />
              <span>Metro (Cleanest)</span>
            </div>
            <div className="text-[11px] text-slate-300">0.2 cigs · 32 min</div>
            <Badge variant="mint" size="sm" className="mt-1">Recommended</Badge>
          </div>

          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-1.5 text-red-300 font-semibold mb-1">
              <Car className="w-4 h-4" />
              <span>Ring Road Auto</span>
            </div>
            <div className="text-[11px] text-slate-300">1.4 cigs · 28 min</div>
            <Badge variant="danger" size="sm" className="mt-1">7x Smog Exposure</Badge>
          </div>
        </div>
      </GlassCard>

      <GlassCard variant="subtle" className="p-4 text-center">
        <Route className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
        <p className="text-xs text-slate-400">
          Google Maps Demo Key + Leaflet fallback map integration coming in Day 6.
        </p>
      </GlassCard>
    </div>
  );
};

export default RoutesPage;
