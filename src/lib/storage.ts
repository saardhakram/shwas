/**
 * Typed, exception-safe browser storage wrapper for Shwas.
 *
 * Centralizes all localStorage key names and gracefully handles private-mode
 * SecurityError, QuotaExceededError, SSR/non-browser contexts, and corrupt JSON.
 */

import { logger } from './logger.js';

export const STORAGE_KEYS = {
  PROFILE: 'shwas_profile',
  LANGUAGE: 'shwas_lang',
  COMMUNITY_ACTIVE_GROUP: 'shwas_community_active_group',
  COMMUNITY_LOCAL_STORE: 'shwas_community_local_store',
  LOCAL_USER_ID: 'shwas_local_user_id',
  planCache: (dedupeKey: string): string => `shwas_plan_${dedupeKey}`,
  planCompleted: (dateStr: string): string => `shwas_plan_completed_${dateStr}`,
} as const;

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TypedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
  getJson<T>(key: string): T | null;
  setJson<T>(key: string, value: T): boolean;
}

function resolveDefaultBackend(): StorageBackend | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (err) {
    logger.warn('[Storage] localStorage unavailable:', err);
    return null;
  }
}

export function createStorage(getBackend: () => StorageBackend | null): TypedStorage {
  const getItem = (key: string): string | null => {
    try {
      const backend = getBackend();
      return backend ? backend.getItem(key) : null;
    } catch (err) {
      logger.warn(`[Storage] Failed to read key "${key}":`, err);
      return null;
    }
  };

  const setItem = (key: string, value: string): boolean => {
    try {
      const backend = getBackend();
      if (!backend) return false;
      backend.setItem(key, value);
      return true;
    } catch (err) {
      logger.warn(`[Storage] Failed to write key "${key}":`, err);
      return false;
    }
  };

  const removeItem = (key: string): boolean => {
    try {
      const backend = getBackend();
      if (!backend) return false;
      backend.removeItem(key);
      return true;
    } catch (err) {
      logger.warn(`[Storage] Failed to remove key "${key}":`, err);
      return false;
    }
  };

  const getJson = <T>(key: string): T | null => {
    const raw = getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn(`[Storage] Failed to parse JSON for key "${key}":`, err);
      return null;
    }
  };

  const setJson = <T>(key: string, value: T): boolean => {
    try {
      return setItem(key, JSON.stringify(value));
    } catch (err) {
      logger.warn(`[Storage] Failed to serialize JSON for key "${key}":`, err);
      return false;
    }
  };

  return { getItem, setItem, removeItem, getJson, setJson };
}

export const storage: TypedStorage = createStorage(resolveDefaultBackend);
