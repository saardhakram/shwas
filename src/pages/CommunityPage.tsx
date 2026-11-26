import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, LogOut, Share2 } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { formatSavedCount } from '../lib/community';
import { useCommunityGroup } from '../features/community/useCommunityGroup';
import { JoinCreateGroupView } from '../features/community/JoinCreateGroupView';
import { LeaderboardCard } from '../features/community/LeaderboardCard';
import { LocalAlertsCard } from '../features/community/LocalAlertsCard';
import { ShareDayModal } from '../features/community/ShareDayModal';

export const CommunityPage: React.FC = () => {
  const { t } = useTranslation();
  const c = useCommunityGroup();

  if (!c.activeGroup) {
    return (
      <JoinCreateGroupView
        defaultFamilyLabel={c.defaultFamilyLabel}
        familyNameInput={c.familyNameInput}
        groupNameInput={c.groupNameInput}
        joinCodeInput={c.joinCodeInput}
        formError={c.formError}
        onFamilyNameChange={c.setFamilyNameInput}
        onGroupNameChange={c.setGroupNameInput}
        onJoinCodeChange={c.setJoinCodeInput}
        onCreateGroup={c.handleCreateGroup}
        onJoinGroup={c.handleJoinGroup}
        onJoinDemo={c.handleJoinDemo}
      />
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            {c.activeGroup.name} · {c.weeklyStats.memberCount}{' '}
            {c.weeklyStats.memberCount === 1 ? 'family' : 'families'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={c.handleCopyCode}
              aria-label={`Copy join code ${c.activeGroup.join_code}`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[10px] font-mono text-teal-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              title="Copy join code"
            >
              <span>Code: {c.activeGroup.join_code}</span>
              {c.copiedCode ? (
                <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="w-3 h-3" aria-hidden="true" />
              )}
            </button>
            {c.isLoading && (
              <span className="text-[10px] text-slate-400" role="status">
                Syncing…
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={c.handleLeaveGroup}
          className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-400 hover:text-white transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          title="Switch or leave group"
          aria-label="Leave group"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {c.loadError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200"
        >
          {c.loadError}
        </div>
      )}

      <GlassCard
        variant="mint"
        className="p-5 text-center space-y-3 bg-gradient-to-b from-teal-950/50 to-[#0f172a]/85 border-teal-400/30"
      >
        <div className="text-[11px] uppercase tracking-wider font-semibold text-teal-300">
          Collective Impact
        </div>
        <div className="space-y-1">
          <div className="font-numbers text-4xl font-bold text-white tracking-tight">
            {formatSavedCount(c.weeklyStats.totalWeeklySaved)}
          </div>
          <p className="text-xs text-slate-200 font-medium">
            {t('community.togetherSaved', 'Together we saved {{count}} cigarettes this week', {
              count: Number(formatSavedCount(c.weeklyStats.totalWeeklySaved)),
            })}
          </p>
        </div>

        <div className="pt-1 flex justify-center">
          <button
            type="button"
            onClick={c.handleOpenShare}
            aria-label={t('community.shareDay', 'Share my day')}
            className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-teal-400/20 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('community.shareDay', 'Share my day')}</span>
          </button>
        </div>
      </GlassCard>

      <LeaderboardCard leaderboard={c.weeklyStats.leaderboard} currentUserId={c.currentUserId} />

      <LocalAlertsCard
        alerts={c.alerts}
        showReportForm={c.showReportForm}
        alertType={c.alertType}
        alertMessage={c.alertMessage}
        isSubmittingAlert={c.isSubmittingAlert}
        onToggleReportForm={() => c.setShowReportForm((v) => !v)}
        onAlertTypeChange={c.setAlertType}
        onAlertMessageChange={c.setAlertMessage}
        onSubmitReport={c.handleReportSubmit}
      />

      {c.showShareModal && (
        <ShareDayModal
          groupName={c.activeGroup.name}
          aqi={c.aqi}
          myTodaySaved={c.myTodaySaved}
          shareText={c.shareText}
          shareFeedback={c.shareFeedback}
          isGeneratingShare={c.isGeneratingShare}
          shareCardRef={c.shareCardRef}
          onClose={() => c.setShowShareModal(false)}
          onNativeShare={c.handleNativeShare}
          onDownloadPng={c.handleDownloadPng}
        />
      )}
    </div>
  );
};

export default CommunityPage;
