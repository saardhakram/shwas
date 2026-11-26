import { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import { useAirQuality } from '../../components/layout/AppLayout';
import {
  aggregateWeeklyCommunityStats,
  buildShareText,
  formatSavedCount,
  isValidJoinCode,
  type AlertType,
  type CommunityAlert,
  type CommunityGroup,
  type CommunityMember,
  type DailySavingRow,
} from '../../lib/community';
import {
  createCommunityGroup,
  getActiveCommunityGroup,
  getCurrentUserId,
  joinCommunityGroupByCode,
  joinDemoGreenParkSociety,
  loadCommunitySnapshot,
  reportLocalAlert,
  setActiveCommunityGroup,
} from '../../lib/communityService';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

function useShareCard(shareText: string, myTodaySaved: number) {
  const { t } = useTranslation();
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState<boolean>(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const ensureShareImage = async (): Promise<string | null> => {
    if (shareImageUrl) return shareImageUrl;
    if (!shareCardRef.current) return null;
    const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true });
    setShareImageUrl(dataUrl);
    return dataUrl;
  };

  const handleOpenShare = () => {
    setShowShareModal(true);
    setShareFeedback(null);
    setShareImageUrl(null);
    setIsGeneratingShare(true);

    setTimeout(async () => {
      try {
        if (shareCardRef.current) {
          const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true });
          setShareImageUrl(dataUrl);
        }
      } catch (err) {
        logger.warn('[Community] Share card PNG render notice:', err);
      } finally {
        setIsGeneratingShare(false);
      }
    }, 120);
  };

  const handleNativeShare = async () => {
    setShareFeedback(null);
    try {
      const dataUrl = await ensureShareImage();
      if (!navigator.share) {
        setShareFeedback(
          t(
            'community.shareUnsupported',
            'Web Share is not supported in this browser — use WhatsApp or Download below.',
          ),
        );
        return;
      }
      if (dataUrl && typeof fetch !== 'undefined') {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'shwas-day.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Shwas — Clean Air Progress',
            text: shareText,
            files: [file],
          });
          setShareFeedback(t('community.shareSuccess', 'Shared successfully!'));
          return;
        }
      }
      await navigator.share({ title: 'Shwas — Clean Air Progress', text: shareText });
      setShareFeedback(t('community.shareSuccess', 'Shared successfully!'));
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setShareFeedback(
          t('community.shareFallbackHint', 'Use WhatsApp or Download PNG below to share.'),
        );
      }
    }
  };

  const handleDownloadPng = async () => {
    try {
      const dataUrl = await ensureShareImage();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `shwas-saved-${formatSavedCount(myTodaySaved)}-cigs.png`;
      link.href = dataUrl;
      link.click();
      setShareFeedback(t('community.downloadSuccess', 'Downloaded card image!'));
    } catch (err) {
      logger.warn('[Community] Share card PNG export failed:', err);
      setShareFeedback(
        t('community.downloadError', 'Could not export image. Try WhatsApp share instead.'),
      );
    }
  };

  return {
    showShareModal,
    setShowShareModal,
    shareFeedback,
    isGeneratingShare,
    shareCardRef,
    handleOpenShare,
    handleNativeShare,
    handleDownloadPng,
  };
}

function useCommunitySnapshot(activeGroup: CommunityGroup | null) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [savings, setSavings] = useState<DailySavingRow[]>([]);
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);
  const [snapshotNow, setSnapshotNow] = useState<Date>(() => new Date());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshSnapshot = useCallback(
    async (group: CommunityGroup) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const snap = await loadCommunitySnapshot(group);
        setMembers(snap.members);
        setSavings(snap.savings);
        setAlerts(snap.alerts);
        setSnapshotNow(new Date());
      } catch (err) {
        logger.warn('[CommunityPage] Snapshot load error:', err);
        setLoadError(
          t('community.errSnapshot', 'Could not refresh group data. Showing cached snapshot.'),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!activeGroup) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) refreshSnapshot(activeGroup);
    });

    if (!isSupabaseConfigured || activeGroup.id.startsWith('demo-')) {
      return () => {
        active = false;
      };
    }

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
      active = false;
      supabase.removeChannel(channel);
    };
  }, [activeGroup, refreshSnapshot]);

  const clearSnapshot = () => {
    setMembers([]);
    setSavings([]);
    setAlerts([]);
  };

  return { members, savings, alerts, snapshotNow, setAlerts, isLoading, loadError, clearSnapshot };
}

export function useCommunityGroup() {
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
  const [groupNameInput, setGroupNameInput] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [familyNameInput, setFamilyNameInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const [showReportForm, setShowReportForm] = useState<boolean>(false);
  const [alertType, setAlertType] = useState<AlertType>('garbage_burning');
  const [alertMessage, setAlertMessage] = useState<string>('');
  const [isSubmittingAlert, setIsSubmittingAlert] = useState<boolean>(false);

  const resolvedFamilyName = familyNameInput.trim() || defaultFamilyLabel;
  const snapshot = useCommunitySnapshot(activeGroup);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  const weeklyStats = useMemo(
    () => aggregateWeeklyCommunityStats(snapshot.members, snapshot.savings, snapshot.snapshotNow),
    [snapshot.members, snapshot.savings, snapshot.snapshotNow],
  );

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

  const share = useShareCard(shareText, myTodaySaved);

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (groupNameInput.trim().length < 2) {
      setFormError(
        t('community.errGroupName', 'Enter a society or school name (at least 2 characters).'),
      );
      return;
    }
    setActiveGroup(await createCommunityGroup(groupNameInput, resolvedFamilyName));
    setGroupNameInput('');
  };

  const handleJoinGroup = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isValidJoinCode(joinCodeInput)) {
      setFormError(
        t('community.errJoinCode', 'Enter a valid 6-character join code (e.g. GRNPK6).'),
      );
      return;
    }
    const res = await joinCommunityGroupByCode(joinCodeInput, resolvedFamilyName);
    if (res.group) {
      setActiveGroup(res.group);
      setJoinCodeInput('');
    } else {
      setFormError(
        res.error || t('community.errGroupNotFound', 'Could not find a group with that code.'),
      );
    }
  };

  const handleJoinDemo = async () => {
    setFormError(null);
    setActiveGroup(await joinDemoGreenParkSociety(resolvedFamilyName));
  };

  const handleLeaveGroup = () => {
    setActiveCommunityGroup(null);
    setActiveGroup(null);
    snapshot.clearSnapshot();
  };

  const handleCopyCode = async () => {
    if (!activeGroup) return;
    try {
      await navigator.clipboard.writeText(activeGroup.join_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      logger.warn('[Community] Clipboard copy failed:', err);
    }
  };

  const handleReportSubmit = async (e: FormEvent) => {
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
      snapshot.setAlerts((prev) => [saved, ...prev]);
      setAlertMessage('');
      setShowReportForm(false);
    } finally {
      setIsSubmittingAlert(false);
    }
  };

  return {
    aqi,
    defaultFamilyLabel,
    activeGroup,
    currentUserId,
    alerts: snapshot.alerts,
    isLoading: snapshot.isLoading,
    loadError: snapshot.loadError,
    groupNameInput,
    setGroupNameInput,
    joinCodeInput,
    setJoinCodeInput,
    familyNameInput,
    setFamilyNameInput,
    formError,
    copiedCode,
    showReportForm,
    setShowReportForm,
    alertType,
    setAlertType,
    alertMessage,
    setAlertMessage,
    isSubmittingAlert,
    weeklyStats,
    myTodaySaved,
    shareText,
    ...share,
    handleCreateGroup,
    handleJoinGroup,
    handleJoinDemo,
    handleLeaveGroup,
    handleCopyCode,
    handleReportSubmit,
  };
}
