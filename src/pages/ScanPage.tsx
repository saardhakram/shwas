import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Sparkles, ShieldCheck } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';

export const ScanPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">
            {t('scan.title', 'Shwas Scan')}
          </h2>
          <p className="text-xs text-slate-400">
            {t('scan.subtitle', 'AI-powered indoor pollution audit with Gemini Vision')}
          </p>
        </div>
        <Badge variant="mint" size="sm">Gemini Vision</Badge>
      </div>

      <GlassCard className="p-8 text-center flex flex-col items-center justify-center gap-4 border-dashed border-white/20">
        <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-lg shadow-teal-500/10">
          <Camera className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">Scan Room or Kitchen</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Take a photo of your living room, kitchen stove, or street-facing windows to spot hidden pollution sources.
          </p>
        </div>
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 font-semibold text-xs flex items-center gap-2 hover:bg-teal-300 transition-colors shadow-lg shadow-teal-400/20"
        >
          <Sparkles className="w-4 h-4" />
          <span>Launch Camera Viewfinder (Day 3)</span>
        </button>
      </GlassCard>

      <GlassCard variant="subtle" className="p-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>Calculates exact cigarette savings per fix and adds actions to your daily air plan.</span>
        </div>
      </GlassCard>
    </div>
  );
};

export default ScanPage;
