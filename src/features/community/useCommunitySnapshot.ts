import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CommunityAlert,
  CommunityGroup,
  CommunityMember,
  DailySavingRow,
} from '../../lib/community';
import { loadCommunitySnapshot } from '../../lib/communityService';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export function useCommunitySnapshot(activeGroup: CommunityGroup | null) {
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
