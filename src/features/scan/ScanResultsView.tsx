import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Info } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import type { ComputedFix } from '../../lib/fixes';
import { ScanFixCard } from './ScanFixCard';

interface ScanResultsViewProps {
  imagePreview: string;
  detectedRoom: string;
  computedFixes: ComputedFix[];
  totalSaved: number;
  selectedFixId: string | null;
  addedFixIds: Record<string, boolean>;
  errorMessage: string | null;
  scanSource: 'gemini' | 'offline' | null;
  onSelectFix: (id: string) => void;
  onAddToPlan: (fix: ComputedFix) => void;
  onRetake: () => void;
}

export const ScanResultsView: React.FC<ScanResultsViewProps> = ({
  imagePreview,
  detectedRoom,
  computedFixes,
  totalSaved,
  selectedFixId,
  addedFixIds,
  errorMessage,
  scanSource,
  onSelectFix,
  onAddToPlan,
  onRetake,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black/40 shadow-2xl">
        <img
          src={imagePreview}
          alt={t('scan.scannedSpaceAlt', 'Scanned space')}
          className="w-full h-auto max-h-[360px] object-contain block mx-auto"
        />

        {computedFixes.map((item, idx) => {
          const isSelected = selectedFixId === item.id;
          return (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              onClick={() => onSelectFix(item.id)}
              style={{
                left: `${(item.box.x * 100).toFixed(1)}%`,
                top: `${(item.box.y * 100).toFixed(1)}%`,
                width: `${(item.box.w * 100).toFixed(1)}%`,
                height: `${(item.box.h * 100).toFixed(1)}%`,
              }}
              className={`absolute rounded-lg border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-400 bg-amber-400/20 shadow-[0_0_15px_rgba(251,191,36,0.5)] z-20 scale-105'
                  : 'border-teal-400/80 bg-teal-400/10 hover:border-teal-300 hover:bg-teal-400/20 z-10'
              }`}
              aria-label={t('scan.hotspotAria', 'Hotspot: {{label}}', { label: item.label })}
            >
              <span
                className={`absolute -top-3 -left-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                    : 'bg-teal-400 text-slate-950 ring-1 ring-white/50'
                }`}
              >
                {idx + 1}
              </span>
            </button>
          );
        })}

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <span className="px-2 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-medium text-slate-200 border border-white/10 uppercase tracking-wider">
            {t('scan.roomLabel', 'Room: {{room}}', { room: detectedRoom })}
          </span>
          <span className="px-2 py-1 rounded-lg bg-teal-500/20 border border-teal-500/40 backdrop-blur-md text-[11px] font-semibold text-teal-300">
            {computedFixes.length === 1
              ? t('scan.riskFoundOne', '{{count}} risk found', { count: computedFixes.length })
              : t('scan.riskFoundMany', '{{count}} risks found', { count: computedFixes.length })}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-200"
        >
          <Info className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <GlassCard className="p-3.5 bg-gradient-to-r from-teal-950/40 to-slate-900/60 border-teal-500/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-white">
              {computedFixes.length === 1
                ? t('scan.fixFoundOne', '{{count}} fix found', { count: computedFixes.length })
                : t('scan.fixFoundMany', '{{count}} fixes found', { count: computedFixes.length })}
            </div>
            <div className="text-[11px] text-teal-300">
              {t('scan.saveUpToPrefix', 'Save up to')}{' '}
              <strong className="font-bold text-teal-200">
                {totalSaved} {t('app.units.cigarettesPerDayCompact', 'cigarettes/day')}
              </strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetake}
            aria-label={t('scan.retake', 'Retake')}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs text-slate-200 hover:bg-white/20 transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('scan.retake', 'Retake')}</span>
          </button>
        </div>
      </GlassCard>

      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-0.5">
          {t('scan.recommendedFixes', 'Recommended Fixes & Impact')}
        </h2>
        {computedFixes.map((item, idx) => (
          <ScanFixCard
            key={`${item.id}-${idx}`}
            item={item}
            index={idx}
            isSelected={selectedFixId === item.id}
            isAdded={Boolean(addedFixIds[item.id])}
            onSelect={onSelectFix}
            onAddToPlan={onAddToPlan}
          />
        ))}
      </div>

      <div className="pt-2 text-center">
        <span className="text-[10px] text-slate-400 font-mono">
          {scanSource === 'gemini'
            ? t('scan.scannedByGemini', '✦ Scanned by Gemini Vision')
            : t('scan.offlineAudit', '✦ Offline Audit')}
        </span>
      </div>
    </div>
  );
};
