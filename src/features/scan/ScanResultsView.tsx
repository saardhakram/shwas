import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CheckCircle2, Info, PlusCircle, ShieldCheck } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Badge from '../../components/ui/Badge';
import type { ComputedFix } from '../../lib/fixes';

interface ScanFixCardProps {
  item: ComputedFix;
  index: number;
  isSelected: boolean;
  isAdded: boolean;
  onSelect: (id: string) => void;
  onAddToPlan: (fix: ComputedFix) => void;
}

const ScanFixCard: React.FC<ScanFixCardProps> = ({
  item,
  index,
  isSelected,
  isAdded,
  onSelect,
  onAddToPlan,
}) => {
  const { t } = useTranslation();

  return (
    <GlassCard
      className={`p-4 transition-all space-y-3 ${
        isSelected
          ? 'border-amber-400/50 bg-amber-500/5 shadow-lg shadow-amber-500/5'
          : 'border-white/10'
      }`}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(item.id)}
        className="w-full text-left flex items-start justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg"
      >
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-teal-400/20 border border-teal-400/40 text-teal-300 text-[10px] font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <div>
            <h4 className="text-xs font-bold text-white">{item.label}</h4>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              {t('scan.categoryLabel', 'Category: {{category}}', { category: item.category })}
            </span>
          </div>
        </div>

        <Badge variant="mint" size="sm" className="whitespace-nowrap shrink-0">
          {t('scan.reductionBadge', '−{{percent}}% indoor PM2.5 · −{{cigs}} cigs', {
            percent: item.reductionPercent,
            cigs: item.cigarettesSaved,
          })}
        </Badge>
      </button>

      <div className="text-xs text-slate-300 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
        <span className="text-slate-400 font-medium">
          {t('scan.whyItMatters', 'Why it matters:')}{' '}
        </span>
        {item.why}
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-teal-300 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
          <span>{t('scan.actionableFix', 'Actionable Fix')}</span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">{item.fix}</p>
      </div>

      <div className="pt-1 flex items-center justify-between border-t border-white/5">
        <div className="text-[11px] text-slate-400">
          {t('scan.indoorPm25', 'Indoor PM2.5:')} {item.beforePm25} →{' '}
          <span className="text-teal-300 font-semibold">{item.afterPm25} µg/m³</span>
        </div>
        <button
          type="button"
          disabled={isAdded}
          aria-label={
            isAdded
              ? t('scan.addedToPlanAria', '{{label}} added to plan', { label: item.label })
              : t('scan.addToPlanAria', "Add {{label}} fix to today's plan", { label: item.label })
          }
          onClick={(e) => {
            e.stopPropagation();
            onAddToPlan(item);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
            isAdded
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 cursor-default'
              : 'bg-teal-400 text-slate-950 hover:bg-teal-300 active:scale-95 shadow-md shadow-teal-400/20'
          }`}
        >
          {isAdded ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('scan.addedToPlan', 'Added to Plan')}</span>
            </>
          ) : (
            <>
              <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('scan.addToPlan', 'Add to my plan')}</span>
            </>
          )}
        </button>
      </div>
    </GlassCard>
  );
};

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
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-0.5">
          {t('scan.recommendedFixes', 'Recommended Fixes & Impact')}
        </div>
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
