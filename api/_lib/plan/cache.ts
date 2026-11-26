/**
 * Daily plan response cache abstraction for `/api/plan`.
 *
 * `InMemoryPlanCache` is per warm serverless instance; injecting `PlanCache`
 * keeps tests isolated and allows plugging in a shared cache later.
 */

import { PLAN_CACHE_TTL_MS } from '../../../shared/constants.js';
import type { RawPlanItem, UserProfile } from '../../../shared/types.js';

export interface PlanCacheEntry {
  plan: RawPlanItem[];
  source: string;
  timestamp: number;
}

export interface PlanCache {
  get(key: string): PlanCacheEntry | null;
  set(key: string, entry: PlanCacheEntry): void;
}

export class InMemoryPlanCache implements PlanCache {
  private readonly store = new Map<string, PlanCacheEntry>();

  constructor(private readonly ttlMs: number = PLAN_CACHE_TTL_MS) {}

  get(key: string): PlanCacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  set(key: string, entry: PlanCacheEntry): void {
    this.store.set(key, entry);
  }
}

export function computePlanCacheKey(profile: UserProfile, dateStr: string): string {
  const familyKey = (profile.family || [])
    .map((m) => `${m.id}_${m.age}_${m.routine?.hoursOutside || 0}_${m.routine?.hoursAway || 0}`)
    .sort()
    .join('|');
  const homeKey = `${profile.home?.windowsFacingRoad}_${profile.home?.purifier}_${profile.home?.chimney}_${profile.home?.cookingFuel}_${profile.home?.commuteMode}`;
  const locKey = profile.location?.name || `${profile.location?.lat}_${profile.location?.lon}`;
  const langKey = profile.language || 'en';
  return `plan_${dateStr}_${langKey}_${locKey}_${familyKey}_${homeKey}`;
}
