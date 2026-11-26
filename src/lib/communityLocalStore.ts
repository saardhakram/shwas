/**
 * LocalStorage mirror & demo society seeder for Shwas Community.
 */

import type { CommunityAlert, CommunityGroup, CommunityMember, DailySavingRow } from './community';

const ACTIVE_GROUP_KEY = 'shwas_community_active_group';
const LOCAL_STORE_KEY = 'shwas_community_local_store';
const LOCAL_USER_ID_KEY = 'shwas_local_user_id';

export interface LocalCommunityStore {
  groups: Record<string, CommunityGroup>;
  members: Record<string, CommunityMember[]>;
  savings: Record<string, DailySavingRow[]>;
  alerts: Record<string, CommunityAlert[]>;
}

export function readLocalStore(): LocalCommunityStore {
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

export function writeLocalStore(store: LocalCommunityStore): void {
  try {
    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

export function getOrCreateLocalUserId(): string {
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

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getPastDayString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function upsertLocalGroupMember(
  store: LocalCommunityStore,
  group: CommunityGroup,
  userId: string,
  displayName: string,
): void {
  store.groups[group.id] = group;
  const list = store.members[group.id] || [];
  const existingIdx = list.findIndex((m) => m.user_id === userId);
  if (existingIdx >= 0) {
    list[existingIdx].display_name = displayName;
  } else {
    list.push({ group_id: group.id, user_id: userId, display_name: displayName });
  }
  store.members[group.id] = list;
}

function buildDemoSavings(groupId: string): DailySavingRow[] {
  const entries: Array<[string, number[]]> = [
    ['demo_sharma', [3.4, 4.1, 3.8, 4.2, 3.5]],
    ['demo_kapoor', [2.8, 3.1, 2.9]],
    ['demo_verma', [2.1, 2.4]],
  ];
  return entries.flatMap(([userId, values]) =>
    values.map((cigarettesSaved, daysAgo) => ({
      group_id: groupId,
      user_id: userId,
      day: getPastDayString(daysAgo),
      cigarettes_saved: cigarettesSaved,
    })),
  );
}

function buildDemoAlerts(groupId: string): CommunityAlert[] {
  const now = Date.now();
  return [
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

export function seedDemoGreenParkInStore(userId: string, displayName: string): CommunityGroup {
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
    existingMembers.push({
      group_id: groupId,
      user_id: userId,
      display_name: displayName || 'Your Family',
    });
  }
  store.members[groupId] = existingMembers;

  if (!store.savings[groupId]?.length) {
    store.savings[groupId] = buildDemoSavings(groupId);
  }
  if (!store.alerts[groupId]?.length) {
    store.alerts[groupId] = buildDemoAlerts(groupId);
  }

  writeLocalStore(store);
  setActiveCommunityGroup(group);
  return group;
}
