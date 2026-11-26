/**
 * Shwas Community Persistence Service
 *
 * Syncs groups, memberships, daily_savings, and local alerts with Supabase when
 * 003_community.sql is applied, and seamlessly mirrors into localStorage so the
 * full experience works offline or before the migration is applied.
 */

import { isSupabaseConfigured, supabase, initAnonymousAuth } from './supabase';
import {
  AlertType,
  CommunityAlert,
  CommunityGroup,
  CommunityMember,
  DailySavingRow,
  generateJoinCode,
  normalizeJoinCode,
} from './community';
import {
  getActiveCommunityGroup,
  getOrCreateLocalUserId,
  getPastDayString,
  getTodayDateString,
  readLocalStore,
  seedDemoGreenParkInStore,
  setActiveCommunityGroup,
  upsertLocalGroupMember,
  writeLocalStore,
} from './communityLocalStore';

export { getActiveCommunityGroup, setActiveCommunityGroup };

export async function getCurrentUserId(): Promise<string> {
  if (isSupabaseConfigured) {
    try {
      let user = (await supabase.auth.getSession()).data.session?.user;
      if (!user) {
        user = (await initAnonymousAuth()) || undefined;
      }
      if (user?.id) return user.id;
    } catch {
      // fall through to local id
    }
  }
  return getOrCreateLocalUserId();
}

/**
 * Seeds a local demo society ("Green Park Society") so first-time evaluators
 * can explore a live group leaderboard and local alerts in one tap.
 */
export async function joinDemoGreenParkSociety(displayName: string): Promise<CommunityGroup> {
  const userId = await getCurrentUserId();
  return seedDemoGreenParkInStore(userId, displayName);
}

/**
 * Creates a new society/school group with a unique 6-character join code.
 */
export async function createCommunityGroup(
  name: string,
  displayName: string,
): Promise<CommunityGroup> {
  const trimmedName = name.trim();
  const safeDisplay = displayName.trim() || 'My Family';
  const userId = await getCurrentUserId();
  const joinCode = generateJoinCode();

  let createdGroup: CommunityGroup | null = null;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('groups')
        .insert({ name: trimmedName, join_code: joinCode, created_by: userId })
        .select('id, name, join_code, created_by, created_at')
        .single();

      if (!error && data) {
        createdGroup = data as CommunityGroup;
        await supabase
          .from('group_members')
          .upsert(
            { group_id: createdGroup.id, user_id: userId, display_name: safeDisplay },
            { onConflict: 'group_id,user_id' },
          );
      }
    } catch (err) {
      console.warn('[Community] Supabase createGroup fell back to local:', err);
    }
  }

  if (!createdGroup) {
    createdGroup = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `grp_${Date.now()}`,
      name: trimmedName,
      join_code: joinCode,
      created_by: userId,
      created_at: new Date().toISOString(),
    };
  }

  const store = readLocalStore();
  store.groups[createdGroup.id] = createdGroup;
  store.members[createdGroup.id] = [
    { group_id: createdGroup.id, user_id: userId, display_name: safeDisplay },
  ];
  store.savings[createdGroup.id] = store.savings[createdGroup.id] || [];
  store.alerts[createdGroup.id] = store.alerts[createdGroup.id] || [];
  writeLocalStore(store);
  setActiveCommunityGroup(createdGroup);
  return createdGroup;
}

async function joinViaSupabaseRpc(
  code: string,
  userId: string,
  safeDisplay: string,
): Promise<{ group: CommunityGroup | null; notFound?: boolean }> {
  try {
    // Use SECURITY DEFINER RPC `join_group_by_code` (005_join_by_code.sql) so groups table
    // never exposes join codes to non-members
    const { data, error } = await supabase.rpc('join_group_by_code', {
      code,
      display_name: safeDisplay,
    });

    const resolved = Array.isArray(data) ? data[0] : data;
    if (!error && resolved?.id) {
      const grp = resolved as CommunityGroup;
      const store = readLocalStore();
      upsertLocalGroupMember(store, grp, userId, safeDisplay);
      writeLocalStore(store);
      setActiveCommunityGroup(grp);
      return { group: grp };
    }

    if (error && String(error.message || '').includes('GROUP_NOT_FOUND')) {
      return { group: null, notFound: true };
    }
  } catch (err) {
    console.warn('[Community] Supabase join_group_by_code RPC notice:', err);
  }
  return { group: null };
}

/**
 * Joins an existing group by its 6-character join code.
 */
export async function joinCommunityGroupByCode(
  rawCode: string,
  displayName: string,
): Promise<{ group: CommunityGroup | null; error?: string }> {
  const code = normalizeJoinCode(rawCode);
  if (code.length !== 6) {
    return { group: null, error: 'Please enter a valid 6-character join code.' };
  }

  const safeDisplay = displayName.trim() || 'My Family';
  const userId = await getCurrentUserId();

  if (code === 'GRNPK6') {
    const demo = await joinDemoGreenParkSociety(safeDisplay);
    return { group: demo };
  }

  const notFoundError = `No group found for code "${code}". Check the code or create a new group.`;

  if (isSupabaseConfigured) {
    const rpcRes = await joinViaSupabaseRpc(code, userId, safeDisplay);
    if (rpcRes.group) return { group: rpcRes.group };
    if (rpcRes.notFound) return { group: null, error: notFoundError };
  }

  const store = readLocalStore();
  const localMatch = Object.values(store.groups).find((g) => g.join_code === code);
  if (localMatch) {
    upsertLocalGroupMember(store, localMatch, userId, safeDisplay);
    writeLocalStore(store);
    setActiveCommunityGroup(localMatch);
    return { group: localMatch };
  }

  return { group: null, error: notFoundError };
}

/**
 * Loads members, daily_savings (last 14 days for streaks), and alerts for the active group.
 */
export async function loadCommunitySnapshot(group: CommunityGroup): Promise<{
  members: CommunityMember[];
  savings: DailySavingRow[];
  alerts: CommunityAlert[];
}> {
  const store = readLocalStore();
  const isDemo = group.id.startsWith('demo-');

  if (isSupabaseConfigured && !isDemo) {
    try {
      const sinceDay = getPastDayString(14);
      const [memRes, savRes, alertRes] = await Promise.all([
        supabase
          .from('group_members')
          .select('group_id, user_id, display_name, joined_at')
          .eq('group_id', group.id),
        supabase
          .from('daily_savings')
          .select('user_id, group_id, day, cigarettes_saved')
          .eq('group_id', group.id)
          .gte('day', sinceDay),
        supabase
          .from('alerts')
          .select('id, group_id, user_id, type, message, lat, lon, created_at')
          .eq('group_id', group.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (!memRes.error && !savRes.error && !alertRes.error) {
        const members = (memRes.data || []) as CommunityMember[];
        const savings = (savRes.data || []) as DailySavingRow[];
        const alerts = (alertRes.data || []) as CommunityAlert[];
        store.members[group.id] = members;
        store.savings[group.id] = savings;
        store.alerts[group.id] = alerts;
        writeLocalStore(store);
        return { members, savings, alerts };
      }
    } catch (err) {
      console.warn('[Community] Snapshot fallback to local store:', err);
    }
  }

  return {
    members: store.members[group.id] || [],
    savings: store.savings[group.id] || [],
    alerts: [...(store.alerts[group.id] || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  };
}

/**
 * Upserts the current user's daily cigarette savings for today into their active group.
 * Called automatically when the user checks or unchecks plan items on the Today tab.
 */
export async function upsertTodayDailySavings(
  cigarettesSaved: number,
  displayName?: string,
): Promise<void> {
  const group = getActiveCommunityGroup();
  if (!group) return;

  const userId = await getCurrentUserId();
  const day = getTodayDateString();
  const safeVal = Number(Math.max(0, cigarettesSaved).toFixed(1));

  const store = readLocalStore();
  const members = store.members[group.id] || [];
  if (!members.some((m) => m.user_id === userId)) {
    members.push({
      group_id: group.id,
      user_id: userId,
      display_name: displayName || 'Your Family',
    });
    store.members[group.id] = members;
  }

  const savings = store.savings[group.id] || [];
  const idx = savings.findIndex((s) => s.user_id === userId && s.day === day);
  const nextRow: DailySavingRow = {
    user_id: userId,
    group_id: group.id,
    day,
    cigarettes_saved: safeVal,
  };
  if (idx >= 0) {
    savings[idx] = nextRow;
  } else {
    savings.push(nextRow);
  }
  store.savings[group.id] = savings;
  writeLocalStore(store);

  if (isSupabaseConfigured && !group.id.startsWith('demo-')) {
    try {
      await supabase.from('daily_savings').upsert(
        {
          user_id: userId,
          group_id: group.id,
          day,
          cigarettes_saved: safeVal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,group_id,day' },
      );
    } catch (err) {
      console.warn('[Community] daily_savings Supabase upsert notice:', err);
    }
  }
}

/**
 * Reports a new local pollution alert to the active group.
 */
export async function reportLocalAlert(
  groupId: string,
  type: AlertType,
  message: string,
  lat?: number,
  lon?: number,
): Promise<CommunityAlert> {
  const userId = await getCurrentUserId();
  const trimmedMsg = message.trim();
  const nowIso = new Date().toISOString();

  let savedAlert: CommunityAlert | null = null;

  if (isSupabaseConfigured && !groupId.startsWith('demo-')) {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .insert({
          group_id: groupId,
          user_id: userId,
          type,
          message: trimmedMsg,
          lat: lat ?? null,
          lon: lon ?? null,
        })
        .select('id, group_id, user_id, type, message, lat, lon, created_at')
        .single();

      if (!error && data) {
        savedAlert = data as CommunityAlert;
      }
    } catch (err) {
      console.warn('[Community] Supabase reportAlert fell back to local:', err);
    }
  }

  if (!savedAlert) {
    savedAlert = {
      id: `alert_${Date.now()}`,
      group_id: groupId,
      user_id: userId,
      type,
      message: trimmedMsg,
      lat: lat ?? null,
      lon: lon ?? null,
      created_at: nowIso,
    };
  }

  const store = readLocalStore();
  const list = store.alerts[groupId] || [];
  store.alerts[groupId] = [savedAlert, ...list];
  writeLocalStore(store);

  return savedAlert;
}
