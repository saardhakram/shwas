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

const ACTIVE_GROUP_KEY = 'shwas_community_active_group';
const LOCAL_STORE_KEY = 'shwas_community_local_store';
const LOCAL_USER_ID_KEY = 'shwas_local_user_id';

interface LocalCommunityStore {
  groups: Record<string, CommunityGroup>;
  members: Record<string, CommunityMember[]>;
  savings: Record<string, DailySavingRow[]>;
  alerts: Record<string, CommunityAlert[]>;
}

function readLocalStore(): LocalCommunityStore {
  try {
    const raw = localStorage.getItem(LOCAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        groups: parsed.groups || {},
        members: parsed.members || {},
        savings: parsed.savings || {},
        alerts: parsed.alerts || {},
      };
    }
  } catch {
    // ignore corrupted local store
  }
  return { groups: {}, members: {}, savings: {}, alerts: {} };
}

function writeLocalStore(store: LocalCommunityStore): void {
  try {
    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

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

  let localId = localStorage.getItem(LOCAL_USER_ID_KEY);
  if (!localId) {
    localId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(LOCAL_USER_ID_KEY, localId);
  }
  return localId;
}

export function getActiveCommunityGroup(): CommunityGroup | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GROUP_KEY);
    return raw ? (JSON.parse(raw) as CommunityGroup) : null;
  } catch {
    return null;
  }
}

export function setActiveCommunityGroup(group: CommunityGroup | null): void {
  try {
    if (!group) {
      localStorage.removeItem(ACTIVE_GROUP_KEY);
    } else {
      localStorage.setItem(ACTIVE_GROUP_KEY, JSON.stringify(group));
    }
  } catch {
    // ignore
  }
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPastDayString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Seeds a local demo society ("Green Park Society") so first-time evaluators
 * can explore a live group leaderboard and local alerts in one tap.
 */
export async function joinDemoGreenParkSociety(displayName: string): Promise<CommunityGroup> {
  const userId = await getCurrentUserId();
  const groupId = 'demo-green-park-society';
  const group: CommunityGroup = {
    id: groupId,
    name: 'Green Park Society',
    join_code: 'GRNPK6',
    created_by: userId,
    created_at: new Date().toISOString(),
  };

  const store = readLocalStore();
  store.groups[groupId] = group;

  const existingMembers = store.members[groupId] || [
    { group_id: groupId, user_id: 'demo_sharma', display_name: 'Sharma Family' },
    { group_id: groupId, user_id: 'demo_kapoor', display_name: 'Kapoor Household' },
    { group_id: groupId, user_id: 'demo_verma', display_name: 'Verma Family' },
  ];
  if (!existingMembers.some((m) => m.user_id === userId)) {
    existingMembers.push({ group_id: groupId, user_id: userId, display_name: displayName || 'Your Family' });
  }
  store.members[groupId] = existingMembers;

  if (!store.savings[groupId] || store.savings[groupId].length === 0) {
    store.savings[groupId] = [
      // Sharma Family: 5-day streak
      { group_id: groupId, user_id: 'demo_sharma', day: getPastDayString(0), cigarettes_saved: 3.4 },
      { group_id: groupId, user_id: 'demo_sharma', day: getPastDayString(1), cigarettes_saved: 4.1 },
      { group_id: groupId, user_id: 'demo_sharma', day: getPastDayString(2), cigarettes_saved: 3.8 },
      { group_id: groupId, user_id: 'demo_sharma', day: getPastDayString(3), cigarettes_saved: 4.2 },
      { group_id: groupId, user_id: 'demo_sharma', day: getPastDayString(4), cigarettes_saved: 3.5 },
      // Kapoor Household: 3-day streak
      { group_id: groupId, user_id: 'demo_kapoor', day: getPastDayString(0), cigarettes_saved: 2.8 },
      { group_id: groupId, user_id: 'demo_kapoor', day: getPastDayString(1), cigarettes_saved: 3.1 },
      { group_id: groupId, user_id: 'demo_kapoor', day: getPastDayString(2), cigarettes_saved: 2.9 },
      // Verma Family: 2-day streak
      { group_id: groupId, user_id: 'demo_verma', day: getPastDayString(0), cigarettes_saved: 2.1 },
      { group_id: groupId, user_id: 'demo_verma', day: getPastDayString(1), cigarettes_saved: 2.4 },
    ];
  }

  if (!store.alerts[groupId] || store.alerts[groupId].length === 0) {
    const now = Date.now();
    store.alerts[groupId] = [
      {
        id: 'demo_alert_1',
        group_id: groupId,
        user_id: 'demo_sharma',
        type: 'garbage_burning',
        message: 'Garbage burning reported near Block C park gate',
        lat: 28.559,
        lon: 77.206,
        created_at: new Date(now - 20 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo_alert_2',
        group_id: groupId,
        user_id: 'demo_kapoor',
        type: 'construction_dust',
        message: 'Uncovered cement unloading on Main Market lane',
        lat: 28.561,
        lon: 77.209,
        created_at: new Date(now - 95 * 60 * 1000).toISOString(),
      },
    ];
  }

  writeLocalStore(store);
  setActiveCommunityGroup(group);
  return group;
}

/**
 * Creates a new society/school group with a unique 6-character join code.
 */
export async function createCommunityGroup(
  name: string,
  displayName: string
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
        await supabase.from('group_members').upsert(
          { group_id: createdGroup.id, user_id: userId, display_name: safeDisplay },
          { onConflict: 'group_id,user_id' }
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

/**
 * Joins an existing group by its 6-character join code.
 */
export async function joinCommunityGroupByCode(
  rawCode: string,
  displayName: string
): Promise<{ group: CommunityGroup | null; error?: string }> {
  const code = normalizeJoinCode(rawCode);
  if (code.length !== 6) {
    return { group: null, error: 'Please enter a valid 6-character join code.' };
  }

  const safeDisplay = displayName.trim() || 'My Family';
  const userId = await getCurrentUserId();

  // Check demo code shortcut
  if (code === 'GRNPK6') {
    const demo = await joinDemoGreenParkSociety(safeDisplay);
    return { group: demo };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, join_code, created_by, created_at')
        .eq('join_code', code)
        .maybeSingle();

      if (!error && data) {
        const grp = data as CommunityGroup;
        await supabase.from('group_members').upsert(
          { group_id: grp.id, user_id: userId, display_name: safeDisplay },
          { onConflict: 'group_id,user_id' }
        );
        const store = readLocalStore();
        store.groups[grp.id] = grp;
        const list = store.members[grp.id] || [];
        if (!list.some((m) => m.user_id === userId)) {
          list.push({ group_id: grp.id, user_id: userId, display_name: safeDisplay });
        }
        store.members[grp.id] = list;
        writeLocalStore(store);
        setActiveCommunityGroup(grp);
        return { group: grp };
      }
    } catch (err) {
      console.warn('[Community] Supabase joinGroup lookup failed:', err);
    }
  }

  // Fallback check in local store
  const store = readLocalStore();
  const localMatch = Object.values(store.groups).find((g) => g.join_code === code);
  if (localMatch) {
    const list = store.members[localMatch.id] || [];
    if (!list.some((m) => m.user_id === userId)) {
      list.push({ group_id: localMatch.id, user_id: userId, display_name: safeDisplay });
    }
    store.members[localMatch.id] = list;
    writeLocalStore(store);
    setActiveCommunityGroup(localMatch);
    return { group: localMatch };
  }

  return { group: null, error: `No group found for code "${code}". Check the code or create a new group.` };
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
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  };
}

/**
 * Upserts the current user's daily cigarette savings for today into their active group.
 * Called automatically when the user checks or unchecks plan items on the Today tab.
 */
export async function upsertTodayDailySavings(
  cigarettesSaved: number,
  displayName?: string
): Promise<void> {
  const group = getActiveCommunityGroup();
  if (!group) return;

  const userId = await getCurrentUserId();
  const day = getTodayDateString();
  const safeVal = Number(Math.max(0, cigarettesSaved).toFixed(1));

  // Always update local mirror immediately
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

  // Sync to Supabase if configured and non-demo group
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
        { onConflict: 'user_id,group_id,day' }
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
  lon?: number
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
