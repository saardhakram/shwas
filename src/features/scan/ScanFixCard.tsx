import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PlusCircle, ShieldCheck } from 'lucide-react';
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

export const ScanFixCard: React.FC<ScanFixCardProps> = ({
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
            <h3 className="text-xs font-bold text-white">{item.label}</h3>
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
