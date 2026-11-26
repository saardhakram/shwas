import { useEffect, useMemo, useState } from 'react';
import { useAirQuality } from '../../components/layout/AppLayout';
import {
  aggregateWeeklyCommunityStats,
  buildShareText,
  type CommunityGroup,
} from '../../lib/community';
import {
  getActiveCommunityGroup,
  getCurrentUserId,
  setActiveCommunityGroup,
} from '../../lib/communityService';
import { logger } from '../../lib/logger';
import { useGroupForms } from './useCommunityForms';
import { useLocalAlertsForm } from './useLocalAlertsForm';
import { useCommunitySnapshot } from './useCommunitySnapshot';
import { useShareCard } from './useShareCard';

export function useCommunityGroup() {
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
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const snapshot = useCommunitySnapshot(activeGroup);
  const forms = useGroupForms(defaultFamilyLabel, setActiveGroup);
  const alertForm = useLocalAlertsForm(activeGroup, userProfile?.location, (saved) => {
    snapshot.setAlerts((prev) => [saved, ...prev]);
  });

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

  return {
    aqi,
    defaultFamilyLabel,
    activeGroup,
    currentUserId,
    alerts: snapshot.alerts,
    isLoading: snapshot.isLoading,
    loadError: snapshot.loadError,
    copiedCode,
    weeklyStats,
    myTodaySaved,
    shareText,
    ...forms,
    ...alertForm,
    ...share,
    handleLeaveGroup,
    handleCopyCode,
  };
}
