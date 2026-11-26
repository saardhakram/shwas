import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import {
  Award,
  Flame,
  Users,
  Plus,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  Share2,
  Download,
  MessageCircle,
  Wind,
  LogOut,
  X,
  Sparkles,
  Megaphone,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import { useAirQuality } from '../components/layout/AppLayout';
import {
  ALERT_TYPE_META,
  AlertType,
  CommunityAlert,
  CommunityGroup,
  CommunityMember,
  DailySavingRow,
  aggregateWeeklyCommunityStats,
  buildShareText,
  buildWhatsAppShareUrl,
  formatRelativeTime,
  formatSavedCount,
  isValidJoinCode,
  normalizeJoinCode,
} from '../lib/community';
import {
  createCommunityGroup,
  getActiveCommunityGroup,
  getCurrentUserId,
  joinCommunityGroupByCode,
  joinDemoGreenParkSociety,
  loadCommunitySnapshot,
  reportLocalAlert,
  setActiveCommunityGroup,
} from '../lib/communityService';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export const CommunityPage: React.FC = () => {
  const { t } = useTranslation();
  const { aqi, userProfile } = useAirQuality();

  const defaultFamilyLabel = useMemo(() => {
    const first = userProfile?.family?.[0]?.name;
    if (!first || first.toLowerCase() === 'me') return 'My Family';
    return `${first}'s Family`;
  }, [userProfile?.family]);

  const [activeGroup, setActiveGroup] = useState<CommunityGroup | null>(() =>
    getActiveCommunityGroup(),
  );
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [savings, setSavings] = useState<DailySavingRow[]>([]);
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create / Join forms (start empty with placeholder to prevent "My FamilyRam Family" concatenation)
  const [groupNameInput, setGroupNameInput] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [familyNameInput, setFamilyNameInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const resolvedFamilyName = familyNameInput.trim() || defaultFamilyLabel;

  // Report Alert drawer
  const [showReportForm, setShowReportForm] = useState<boolean>(false);
  const [alertType, setAlertType] = useState<AlertType>('garbage_burning');
  const [alertMessage, setAlertMessage] = useState<string>('');
  const [isSubmittingAlert, setIsSubmittingAlert] = useState<boolean>(false);

  // Share Card modal
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState<boolean>(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  const refreshSnapshot = useCallback(async (group: CommunityGroup) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const snap = await loadCommunitySnapshot(group);
      setMembers(snap.members);
      setSavings(snap.savings);
      setAlerts(snap.alerts);
    } catch (err) {
      console.warn('[CommunityPage] Snapshot load error:', err);
      setLoadError('Could not refresh group data. Showing cached snapshot.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    refreshSnapshot(activeGroup);

    // Subscribe to Supabase Realtime updates when connected to a real group
    if (!isSupabaseConfigured || activeGroup.id.startsWith('demo-')) return;

    const channel = supabase
      .channel(`community_${activeGroup.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_savings',
          filter: `group_id=eq.${activeGroup.id}`,
        },
        () => refreshSnapshot(activeGroup),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `group_id=eq.${activeGroup.id}` },
        () => refreshSnapshot(activeGroup),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeGroup, refreshSnapshot]);

  const weeklyStats = useMemo(
    () => aggregateWeeklyCommunityStats(members, savings, new Date()),
    [members, savings],
  );

  // Today's saved cigarettes for the share card (user's own today saving, or group today sum if > 0)
  const myTodaySaved = useMemo(() => {
    const me = weeklyStats.leaderboard.find((e) => e.userId === currentUserId);
    if (me && me.todaySaved > 0) return me.todaySaved;
    const groupToday = weeklyStats.leaderboard.reduce((s, e) => s + e.todaySaved, 0);
    return groupToday > 0 ? Number(groupToday.toFixed(1)) : 4;
  }, [weeklyStats.leaderboard, currentUserId]);

  const shareText = useMemo(
    () => buildShareText(myTodaySaved, activeGroup?.name),
    [myTodaySaved, activeGroup?.name],
  );

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (groupNameInput.trim().length < 2) {
      setFormError('Enter a society or school name (at least 2 characters).');
      return;
    }
    const created = await createCommunityGroup(groupNameInput, resolvedFamilyName);
    setActiveGroup(created);
    setGroupNameInput('');
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isValidJoinCode(joinCodeInput)) {
      setFormError('Enter a valid 6-character join code (e.g. GRNPK6).');
      return;
    }
    const res = await joinCommunityGroupByCode(joinCodeInput, resolvedFamilyName);
    if (res.group) {
      setActiveGroup(res.group);
      setJoinCodeInput('');
    } else {
      setFormError(res.error || 'Could not find a group with that code.');
    }
  };

  const handleJoinDemo = async () => {
    setFormError(null);
    const demo = await joinDemoGreenParkSociety(resolvedFamilyName);
    setActiveGroup(demo);
  };

  const handleLeaveGroup = () => {
    setActiveCommunityGroup(null);
    setActiveGroup(null);
    setMembers([]);
    setSavings([]);
    setAlerts([]);
  };

  const handleCopyCode = async () => {
    if (!activeGroup) return;
    try {
      await navigator.clipboard.writeText(activeGroup.join_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !alertMessage.trim()) return;
    setIsSubmittingAlert(true);
    try {
      const saved = await reportLocalAlert(
        activeGroup.id,
        alertType,
        alertMessage,
        userProfile?.location?.lat,
        userProfile?.location?.lon,
      );
      setAlerts((prev) => [saved, ...prev]);
      setAlertMessage('');
      setShowReportForm(false);
    } finally {
      setIsSubmittingAlert(false);
    }
  };

  const handleOpenShare = async () => {
    setShowShareModal(true);
    setShareFeedback(null);
    setShareImageUrl(null);
    setIsGeneratingShare(true);

    // Wait a tick for the share card DOM node to paint
    setTimeout(async () => {
      try {
        if (shareCardRef.current) {
          const dataUrl = await toPng(shareCardRef.current, {
            pixelRatio: 2,
            cacheBust: true,
          });
          setShareImageUrl(dataUrl);
        }
      } catch (err) {
        console.warn('[Community] Share card PNG render notice:', err);
      } finally {
        setIsGeneratingShare(false);
      }
    }, 120);
  };

  const handleNativeShare = async () => {
    setShareFeedback(null);
    try {
      let dataUrl = shareImageUrl;
      if (!dataUrl && shareCardRef.current) {
        dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true });
        setShareImageUrl(dataUrl);
      }

      if (navigator.share) {
        if (dataUrl && typeof fetch !== 'undefined') {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], 'shwas-day.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'Shwas — Clean Air Progress',
              text: shareText,
              files: [file],
            });
            setShareFeedback('Shared successfully!');
            return;
          }
        }
        await navigator.share({ title: 'Shwas — Clean Air Progress', text: shareText });
        setShareFeedback('Shared successfully!');
        return;
      }

      setShareFeedback(
        'Web Share is not supported in this browser — use WhatsApp or Download below.',
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setShareFeedback('Use WhatsApp or Download PNG below to share.');
      }
    }
  };

  const handleDownloadPng = async () => {
    try {
      let dataUrl = shareImageUrl;
      if (!dataUrl && shareCardRef.current) {
        dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true });
        setShareImageUrl(dataUrl);
      }
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `shwas-saved-${formatSavedCount(myTodaySaved)}-cigs.png`;
      link.href = dataUrl;
      link.click();
      setShareFeedback('Downloaded card image!');
    } catch {
      setShareFeedback('Could not export image. Try WhatsApp share instead.');
    }
  };

  // --- VIEW 1: Create or Join a Group ---
  if (!activeGroup) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">{t('community.title', 'Community')}</h2>
            <p className="text-xs text-slate-400">
              {t('community.subtitle', 'Track clean air savings with your society or school')}
            </p>
          </div>
          <Badge variant="mint" size="sm">
            Groups
          </Badge>
        </div>

        {/* Display Name input */}
        <GlassCard variant="subtle" className="p-3.5 space-y-1.5">
          <label
            htmlFor="community-family-name"
            className="text-[11px] font-semibold text-slate-300 block"
          >
            Your Family Display Name
          </label>
          <input
            id="community-family-name"
            type="text"
            value={familyNameInput}
            onChange={(e) => setFamilyNameInput(e.target.value)}
            placeholder={defaultFamilyLabel}
            aria-label="Your Family Display Name"
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/50"
          />
        </GlassCard>

        {formError && (
          <div
            role="alert"
            className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200"
          >
            {formError}
          </div>
        )}

        {/* Create a Group */}
        <GlassCard className="p-4 space-y-3 border-white/[0.1]">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-400" aria-hidden="true" />
            <h3 className="text-xs font-bold text-white">
              {t('community.createGroup', 'Create a Society or School Group')}
            </h3>
          </div>
          <p className="text-[11px] text-slate-400">
            Creates a private group with a 6-character join code you can share on WhatsApp.
          </p>
          <form onSubmit={handleCreateGroup} className="flex gap-2">
            <label htmlFor="community-group-name" className="sr-only">
              Society or school group name
            </label>
            <input
              id="community-group-name"
              type="text"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              placeholder="e.g. Green Park Society"
              aria-label="Society or school group name"
              className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/50"
            />
            <button
              type="submit"
              aria-label="Create community group"
              className="px-3.5 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('community.createBtn', 'Create')}</span>
            </button>
          </form>
        </GlassCard>

        {/* Join with a 6-character code */}
        <GlassCard className="p-4 space-y-3 border-white/[0.1]">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h3 className="text-xs font-bold text-white">
              {t('community.joinGroup', 'Join with a 6-Character Code')}
            </h3>
          </div>
          <form onSubmit={handleJoinGroup} className="flex gap-2">
            <label htmlFor="community-join-code" className="sr-only">
              6-character group join code
            </label>
            <input
              id="community-join-code"
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(normalizeJoinCode(e.target.value))}
              maxLength={6}
              placeholder="e.g. GRNPK6"
              aria-label="6-character group join code"
              className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono tracking-widest uppercase text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/50"
            />
            <button
              type="submit"
              aria-label="Join community group with code"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              {t('community.joinBtn', 'Join')}
            </button>
          </form>
        </GlassCard>

        {/* Quick Demo Society */}
        <GlassCard variant="mint" className="p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-teal-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-hidden="true" />
              <span>Preview Green Park Society</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Explore a live leaderboard & local alerts feed (code{' '}
              <span className="font-mono text-teal-300">GRNPK6</span>).
            </p>
          </div>
          <button
            type="button"
            onClick={handleJoinDemo}
            aria-label="Join Green Park Society demo group"
            className="px-3 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 hover:bg-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Join Demo
          </button>
        </GlassCard>
      </div>
    );
  }

  // --- VIEW 2: Active Group Dashboard ---
  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">
      {/* Group Header: "Green Park Society · N families" */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            {activeGroup.name} · {weeklyStats.memberCount}{' '}
            {weeklyStats.memberCount === 1 ? 'family' : 'families'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={handleCopyCode}
              aria-label={`Copy join code ${activeGroup.join_code}`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[10px] font-mono text-teal-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              title="Copy join code"
            >
              <span>Code: {activeGroup.join_code}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="w-3 h-3" aria-hidden="true" />
              )}
            </button>
            {isLoading && (
              <span className="text-[10px] text-slate-400" role="status">
                Syncing…
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLeaveGroup}
          className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-400 hover:text-white transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          title="Switch or leave group"
          aria-label="Leave group"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200"
        >
          {loadError}
        </div>
      )}

      {/* Big Weekly Hero Stat + Share my day CTA */}
      <GlassCard
        variant="mint"
        className="p-5 text-center space-y-3 bg-gradient-to-b from-teal-950/50 to-[#0f172a]/85 border-teal-400/30"
      >
        <div className="text-[11px] uppercase tracking-wider font-semibold text-teal-300">
          Collective Impact
        </div>
        <div className="space-y-1">
          <div className="font-numbers text-4xl font-bold text-white tracking-tight">
            {formatSavedCount(weeklyStats.totalWeeklySaved)}
          </div>
          <p className="text-xs text-slate-200 font-medium">
            {t('community.togetherSaved', 'Together we saved {{count}} cigarettes this week', {
              count: Number(formatSavedCount(weeklyStats.totalWeeklySaved)),
            })}
          </p>
        </div>

        <div className="pt-1 flex justify-center">
          <button
            type="button"
            onClick={handleOpenShare}
            aria-label={t('community.shareDay', 'Share my day')}
            className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-teal-400/20 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('community.shareDay', 'Share my day')}</span>
          </button>
        </div>
      </GlassCard>

      {/* Neighborhood Leaderboard with Streak Flame */}
      <GlassCard className="p-4 space-y-3 border-white/[0.1]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              {t('community.leaderboard', 'Weekly Leaderboard')}
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 text-right">
            Check items on Today to climb
          </span>
        </div>

        <div className="space-y-2">
          {weeklyStats.leaderboard.map((member) => {
            const isMe = member.userId === currentUserId;
            return (
              <div
                key={member.userId}
                className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs ${
                  isMe ? 'bg-teal-500/15 border-teal-400/40' : 'bg-white/[0.04] border-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      member.rank === 1
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : 'bg-white/[0.06] text-slate-300'
                    }`}
                  >
                    {member.rank}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-white flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{member.displayName}</span>
                      {isMe && (
                        <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-full bg-teal-400/20 border border-teal-400/40 text-teal-200 shrink-0">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                      <Flame className="w-3 h-3 shrink-0 fill-amber-400/30" aria-hidden="true" />
                      <span>
                        {member.streakDays > 0
                          ? `${member.streakDays}d streak`
                          : 'Start streak today'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-teal-300">
                    {formatSavedCount(member.weeklySaved)} cigs
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {formatSavedCount(member.todaySaved)} today
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Local Alerts Feed + Report Button */}
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
            onClick={() => setShowReportForm((v) => !v)}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold text-[11px] flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span>{showReportForm ? 'Close' : t('community.reportBtn', 'Report')}</span>
          </button>
        </div>

        {/* Inline Report Form */}
        {showReportForm && (
          <form
            onSubmit={handleReportSubmit}
            className="p-3 rounded-xl bg-white/[0.04] border border-amber-400/25 space-y-2.5"
          >
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Alert type">
              {(Object.keys(ALERT_TYPE_META) as AlertType[]).map((typeKey) => (
                <button
                  key={typeKey}
                  type="button"
                  aria-pressed={alertType === typeKey}
                  onClick={() => setAlertType(typeKey)}
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
              onChange={(e) => setAlertMessage(e.target.value)}
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

        {/* Alerts list */}
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

      {/* "Share my day" Modal with html-to-image Card, Web Share API, WhatsApp & PNG Download */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#0e1626] border border-white/15 p-4 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Share My Day</h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Close share dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rendered Share Card captured by html-to-image */}
            <div
              ref={shareCardRef}
              className="rounded-2xl p-5 bg-gradient-to-br from-[#0f292e] via-[#101828] to-[#1e1522] border border-teal-400/40 text-center space-y-3 shadow-xl"
            >
              <div className="flex items-center justify-center gap-1.5 text-teal-300 text-xs font-bold tracking-wide uppercase">
                <Wind className="w-4 h-4 text-teal-400" />
                <span>Shwas · Breathe Smarter</span>
              </div>

              <div className="py-2">
                <div className="font-numbers text-5xl font-bold text-white">
                  {formatSavedCount(myTodaySaved)}
                </div>
                <div className="text-sm font-semibold text-teal-200 mt-1">
                  We saved {formatSavedCount(myTodaySaved)}{' '}
                  {formatSavedCount(myTodaySaved) === '1' ? 'cigarette' : 'cigarettes'} today 💨
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-300 border-t border-white/10 pt-2.5">
                <span>{activeGroup.name}</span>
                <span>·</span>
                <span>AQI {aqi}</span>
                <span>·</span>
                <span className="text-teal-300 font-semibold">#Shwas</span>
              </div>
            </div>

            {shareFeedback && (
              <p className="text-[11px] text-teal-300 text-center">{shareFeedback}</p>
            )}

            {/* Primary Web Share API button + WhatsApp & Download fallbacks */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={isGeneratingShare}
                onClick={handleNativeShare}
                className="w-full py-2.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>{isGeneratingShare ? 'Preparing card…' : 'Share Card'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={buildWhatsAppShareUrl(shareText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={handleDownloadPng}
                  className="py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-slate-100 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PNG</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityPage;
