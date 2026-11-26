/**
 * Supabase RPC & table operations for Shwas Community groups, savings, and alerts.
 */

import { isSupabaseConfigured, supabase } from './supabase';
import { logger } from './logger';
import type {
  AlertType,
  CommunityAlert,
  CommunityGroup,
  CommunityMember,
  DailySavingRow,
} from './community';

export async function createGroupInSupabase(
  trimmedName: string,
  joinCode: string,
  userId: string,
  safeDisplay: string,
): Promise<CommunityGroup | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: trimmedName, join_code: joinCode, created_by: userId })
      .select('id, name, join_code, created_by, created_at')
      .single();

    if (!error && data) {
      const group = data as CommunityGroup;
      await supabase
        .from('group_members')
        .upsert(
          { group_id: group.id, user_id: userId, display_name: safeDisplay },
          { onConflict: 'group_id,user_id' },
        );
      return group;
    }
  } catch (err) {
    logger.warn('[Community] Supabase createGroup fell back to local:', err);
  }
  return null;
}

export async function joinGroupViaSupabaseRpc(
  code: string,
  safeDisplay: string,
): Promise<{ group: CommunityGroup | null; notFound?: boolean }> {
  if (!isSupabaseConfigured) return { group: null };
  try {
    const { data, error } = await supabase.rpc('join_group_by_code', {
      code,
      display_name: safeDisplay,
    });
    const resolved = Array.isArray(data) ? data[0] : data;
    if (!error && resolved?.id) {
      return { group: resolved as CommunityGroup };
    }
    if (error && String(error.message || '').includes('GROUP_NOT_FOUND')) {
      return { group: null, notFound: true };
    }
  } catch (err) {
    logger.warn('[Community] Supabase join_group_by_code RPC notice:', err);
  }
  return { group: null };
}

export async function fetchSnapshotFromSupabase(
  groupId: string,
  sinceDay: string,
): Promise<{
  members: CommunityMember[];
  savings: DailySavingRow[];
  alerts: CommunityAlert[];
} | null> {
  if (!isSupabaseConfigured || groupId.startsWith('demo-')) return null;
  try {
    const [memRes, savRes, alertRes] = await Promise.all([
      supabase
        .from('group_members')
        .select('group_id, user_id, display_name, joined_at')
        .eq('group_id', groupId),
      supabase
        .from('daily_savings')
        .select('user_id, group_id, day, cigarettes_saved')
        .eq('group_id', groupId)
        .gte('day', sinceDay),
      supabase
        .from('alerts')
        .select('id, group_id, user_id, type, message, lat, lon, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (!memRes.error && !savRes.error && !alertRes.error) {
      return {
        members: (memRes.data || []) as CommunityMember[],
        savings: (savRes.data || []) as DailySavingRow[],
        alerts: (alertRes.data || []) as CommunityAlert[],
      };
    }
  } catch (err) {
    logger.warn('[Community] Snapshot fallback to local store:', err);
  }
  return null;
}

export async function upsertDailySavingInSupabase(params: {
  userId: string;
  groupId: string;
  day: string;
  cigarettesSaved: number;
}): Promise<void> {
  if (!isSupabaseConfigured || params.groupId.startsWith('demo-')) return;
  try {
    await supabase.from('daily_savings').upsert(
      {
        user_id: params.userId,
        group_id: params.groupId,
        day: params.day,
        cigarettes_saved: params.cigarettesSaved,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,group_id,day' },
    );
  } catch (err) {
    logger.warn('[Community] daily_savings Supabase upsert notice:', err);
  }
}

export async function insertAlertInSupabase(params: {
  groupId: string;
  userId: string;
  type: AlertType;
  message: string;
  lat?: number;
  lon?: number;
}): Promise<CommunityAlert | null> {
  if (!isSupabaseConfigured || params.groupId.startsWith('demo-')) return null;
  try {
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        group_id: params.groupId,
        user_id: params.userId,
        type: params.type,
        message: params.message,
        lat: params.lat ?? null,
        lon: params.lon ?? null,
      })
      .select('id, group_id, user_id, type, message, lat, lon, created_at')
      .single();

    if (!error && data) return data as CommunityAlert;
  } catch (err) {
    logger.warn('[Community] Supabase reportAlert fell back to local:', err);
  }
  return null;
}
