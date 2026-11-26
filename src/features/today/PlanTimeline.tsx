import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, Sparkle } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Badge from '../../components/ui/Badge';
import type { AirPlanItem } from '../../types';

interface PlanTimelineProps {
  planItems: AirPlanItem[];
  isPlanLoading: boolean;
  isStillThinking: boolean;
  planSource: string;
  checkedSavings: number;
  totalPotentialSavings: number;
  onToggleItem: (id: string) => void;
}

export const PlanTimeline: React.FC<PlanTimelineProps> = ({
  planItems,
  isPlanLoading,
  isStillThinking,
  planSource,
  checkedSavings,
  totalPotentialSavings,
  onToggleItem,
}) => {
  const { t } = useTranslation();

  const statusLabel = isPlanLoading
    ? isStillThinking
      ? t('today.stillThinking', 'Still thinking…')
      : t('today.generating', 'Generating...')
    : planSource === 'gemini'
      ? t('today.planByGemini', 'Plan by Gemini')
      : t('today.offlinePlan', 'Offline plan');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('today.planTimeline', "Today's Air Plan Timeline")}
          </h3>
          {isPlanLoading ? (
            <span className="text-[10px] text-teal-400 animate-pulse" role="status">
              {statusLabel}
            </span>
          ) : planSource === 'gemini' ? (
            <Badge
              variant="mint"
              size="sm"
              icon={<Sparkle className="w-2.5 h-2.5" aria-hidden="true" />}
            >
              Gemini
            </Badge>
          ) : null}
        </div>
        <span className="text-[11px] text-teal-300 font-medium whitespace-nowrap">
          {checkedSavings > 0
            ? `${checkedSavings.toFixed(1)} cigs saved so far`
            : `Save up to ${totalPotentialSavings.toFixed(1)} cigs`}
        </span>
      </div>

      <div className="space-y-2">
        {planItems.map((item) => (
          <GlassCard
            key={item.id}
            variant={item.completed ? 'mint' : 'subtle'}
            onClick={() => onToggleItem(item.id)}
            className={`flex items-start gap-3 p-3 cursor-pointer transition-all duration-200 select-none ${
              item.completed
                ? 'border-teal-500/40 shadow-sm shadow-teal-500/10'
                : 'hover:border-white/15'
            }`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={item.completed}
              onClick={(e) => {
                e.stopPropagation();
                onToggleItem(item.id);
              }}
              className="mt-0.5 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.action}`}
            >
              {item.completed ? (
                <CheckCircle2
                  className="w-5 h-5 text-teal-400 transition-transform active:scale-90"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="w-5 h-5 text-slate-500 hover:text-slate-300 transition-transform active:scale-90"
                  aria-hidden="true"
                />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0 pr-1">
                  <span className="text-[10px] font-mono text-teal-300/90 font-medium shrink-0">
                    {item.time}
                  </span>
                  <h4
                    className={`text-xs font-semibold leading-tight min-w-0 ${
                      item.completed ? 'text-teal-200 line-through opacity-85' : 'text-slate-100'
                    }`}
                  >
                    {item.action}
                  </h4>
                </div>

                {item.cigarettesSaved > 0 && (
                  <Badge
                    variant={item.completed ? 'mint' : 'neutral'}
                    size="sm"
                    className="shrink-0 whitespace-nowrap font-mono"
                  >
                    -{item.cigarettesSaved.toFixed(1)} cigs
                  </Badge>
                )}
              </div>

              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{item.reason}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="text-center pt-1 pb-1">
        <span className="text-[11px] font-mono text-slate-400">{statusLabel}</span>
      </div>
    </div>
  );
};
