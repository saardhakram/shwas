import React, { type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Megaphone } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Badge from '../../components/ui/Badge';
import {
  ALERT_TYPE_META,
  formatRelativeTime,
  type AlertType,
  type CommunityAlert,
} from '../../lib/community';

interface LocalAlertsCardProps {
  alerts: CommunityAlert[];
  showReportForm: boolean;
  alertType: AlertType;
  alertMessage: string;
  isSubmittingAlert: boolean;
  onToggleReportForm: () => void;
  onAlertTypeChange: (t: AlertType) => void;
  onAlertMessageChange: (msg: string) => void;
  onSubmitReport: (e: FormEvent) => void;
}

export const LocalAlertsCard: React.FC<LocalAlertsCardProps> = ({
  alerts,
  showReportForm,
  alertType,
  alertMessage,
  isSubmittingAlert,
  onToggleReportForm,
  onAlertTypeChange,
  onAlertMessageChange,
  onSubmitReport,
}) => {
  const { t } = useTranslation();

  return (
    <GlassCard className="p-4 space-y-3 border-white/[0.1]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            {t('community.localAlerts', 'Local Air Alerts')}
          </h3>
        </div>
        <button
          type="button"
          aria-expanded={showReportForm}
          aria-label={
            showReportForm ? 'Close local alert form' : 'Report local smoke or dust alert'
          }
          onClick={onToggleReportForm}
          className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold text-[11px] flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          <span>{showReportForm ? 'Close' : t('community.reportBtn', 'Report')}</span>
        </button>
      </div>

      {showReportForm && (
        <form
          onSubmit={onSubmitReport}
          className="p-3 rounded-xl bg-white/[0.04] border border-amber-400/25 space-y-2.5"
        >
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Alert type">
            {(Object.keys(ALERT_TYPE_META) as AlertType[]).map((typeKey) => (
              <button
                key={typeKey}
                type="button"
                aria-pressed={alertType === typeKey}
                onClick={() => onAlertTypeChange(typeKey)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  alertType === typeKey
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:bg-white/[0.07]'
                }`}
              >
                {ALERT_TYPE_META[typeKey].label}
              </button>
            ))}
          </div>

          <label htmlFor="community-alert-msg" className="sr-only">
            Alert location and details
          </label>
          <input
            id="community-alert-msg"
            type="text"
            value={alertMessage}
            onChange={(e) => onAlertMessageChange(e.target.value)}
            placeholder="Where is it? e.g. Near Block C park gate"
            aria-label="Alert location and details"
            maxLength={240}
            className="w-full bg-[#0B0F17]/80 border border-white/[0.12] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50"
          />

          <button
            type="submit"
            disabled={!alertMessage.trim() || isSubmittingAlert}
            aria-label="Post local air alert to group"
            className="w-full py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isSubmittingAlert ? 'Posting alert…' : 'Post Alert to Group'}
          </button>
        </form>
      )}

      {alerts.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">
          No local smoke or dust alerts reported yet.
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.map((al) => {
            const meta = ALERT_TYPE_META[al.type] || ALERT_TYPE_META.other;
            return (
              <div
                key={al.id}
                className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={meta.badgeVariant} size="sm">
                    {meta.shortLabel}
                  </Badge>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatRelativeTime(al.created_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-snug">{al.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
};
