import React from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Flame } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';

export const CommunityPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">
            {t('community.title', 'Community')}
          </h2>
          <p className="text-xs text-slate-400">
            {t('community.subtitle', 'Together we breathe cleaner air')}
          </p>
        </div>
        <Badge variant="mint" size="sm">Live Groups</Badge>
      </div>

      <GlassCard variant="mint" className="p-4 text-center">
        <span className="text-[11px] text-teal-300 uppercase tracking-wider font-semibold">
          This Week in Your Society
        </span>
        <div className="font-numbers text-3xl font-bold text-white my-1">
          1,240 <span className="text-sm font-sans font-normal text-teal-300">cigs saved</span>
        </div>
        <p className="text-xs text-slate-300">
          42 families in Mayur Vihar Society following their daily air plans.
        </p>
      </GlassCard>

      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-200">Neighborhood Leaderboard</h3>
          </div>
          <span className="text-[11px] text-slate-400">Day 7 Feature</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.04]">
            <div className="flex items-center gap-2">
              <span className="w-5 text-center font-bold text-amber-400">1</span>
              <span>Sharma Family</span>
              <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                <Flame className="w-3 h-3 inline" /> 7d streak
              </span>
            </div>
            <span className="font-mono text-teal-300 font-semibold">46 cigs saved</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default CommunityPage;
