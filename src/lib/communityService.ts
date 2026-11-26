/**
 * Shwas Community Persistence Service
 *
 * Orchestrates Supabase sync (via `communityApi.ts`) with local storage mirroring
 * so groups, streaks, and alerts work offline and in demo mode.
 */

import { isSupabaseConfigured, supabase, initAnonymousAuth } from './supabase';
import { logger } from './logger';
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
import {
  createGroupInSupabase,
  fetchSnapshotFromSupabase,
  insertAlertInSupabase,
  joinGroupViaSupabaseRpc,
  upsertDailySavingInSupabase,
} from './communityApi';

export { getActiveCommunityGroup, setActiveCommunityGroup };

export async function getCurrentUserId(): Promise<string> {
  if (isSupabaseConfigured) {
    try {
      let user = (await supabase.auth.getSession()).data.session?.user;
      if (!user) {
        user = (await initAnonymousAuth()) || undefined;
      }
      if (user?.id) return user.id;
    } catch (err) {
      logger.warn('[Community] Session lookup fell back to local user ID:', err);
    }
  }
  return getOrCreateLocalUserId();
}

export async function joinDemoGreenParkSociety(displayName: string): Promise<CommunityGroup> {
  const userId = await getCurrentUserId();
  return seedDemoGreenParkInStore(userId, displayName);
}

export async function createCommunityGroup(
  name: string,
  displayName: string,
): Promise<CommunityGroup> {
  const trimmedName = name.trim();
  const safeDisplay = displayName.trim() || 'My Family';
  const userId = await getCurrentUserId();
  const joinCode = generateJoinCode();

  let createdGroup = await createGroupInSupabase(trimmedName, joinCode, userId, safeDisplay);
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
    return { group: await joinDemoGreenParkSociety(safeDisplay) };
  }

  const notFoundError = `No group found for code "${code}". Check the code or create a new group.`;
  const rpcRes = await joinGroupViaSupabaseRpc(code, safeDisplay);
  if (rpcRes.group) {
    const store = readLocalStore();
    upsertLocalGroupMember(store, rpcRes.group, userId, safeDisplay);
    writeLocalStore(store);
    setActiveCommunityGroup(rpcRes.group);
    return { group: rpcRes.group };
  }
  if (rpcRes.notFound) return { group: null, error: notFoundError };

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

export async function loadCommunitySnapshot(group: CommunityGroup): Promise<{
  members: CommunityMember[];
  savings: DailySavingRow[];
  alerts: CommunityAlert[];
}> {
  const store = readLocalStore();
  const remote = await fetchSnapshotFromSupabase(group.id, getPastDayString(14));
  if (remote) {
    store.members[group.id] = remote.members;
    store.savings[group.id] = remote.savings;
    store.alerts[group.id] = remote.alerts;
    writeLocalStore(store);
    return remote;
  }

  return {
    members: store.members[group.id] || [],
    savings: store.savings[group.id] || [],
    alerts: [...(store.alerts[group.id] || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  };
}

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
  if (idx >= 0) savings[idx] = nextRow;
  else savings.push(nextRow);
  store.savings[group.id] = savings;
  writeLocalStore(store);

  await upsertDailySavingInSupabase({ userId, groupId: group.id, day, cigarettesSaved: safeVal });
}

export async function reportLocalAlert(
  groupId: string,
  type: AlertType,
  message: string,
  lat?: number,
  lon?: number,
): Promise<CommunityAlert> {
  const userId = await getCurrentUserId();
  const trimmedMsg = message.trim();

  let savedAlert = await insertAlertInSupabase({
    groupId,
    userId,
    type,
    message: trimmedMsg,
    lat,
    lon,
  });

  if (!savedAlert) {
    savedAlert = {
      id: `alert_${Date.now()}`,
      group_id: groupId,
      user_id: userId,
      type,
      message: trimmedMsg,
      lat: lat ?? null,
      lon: lon ?? null,
      created_at: new Date().toISOString(),
    };
  }

  const store = readLocalStore();
  store.alerts[groupId] = [savedAlert, ...(store.alerts[groupId] || [])];
  writeLocalStore(store);
  return savedAlert;
}
