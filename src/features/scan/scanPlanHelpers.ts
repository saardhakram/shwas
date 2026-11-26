import type { ComputedFix, DetectedSource } from '../../lib/fixes';
import { logger } from '../../lib/logger';
import { parsePlanCache, serializePlanCache } from '../../lib/planGenerator';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import type { RawPlanItem, UserProfile } from '../../types';

export const OFFLINE_DEMO_SOURCES: DetectedSource[] = [
  {
    id: 'open_window_road',
    label: 'Road-Facing Window Ingress',
    box: { x: 0.15, y: 0.1, w: 0.35, h: 0.5 },
    confidence: 0.88,
  },
  {
    id: 'no_purifier',
    label: 'No Active Air Purifier',
    box: { x: 0.6, y: 0.45, w: 0.3, h: 0.4 },
    confidence: 0.82,
  },
];

export interface ScanApiResponse {
  source?: 'gemini' | 'offline';
  room?: string;
  sources?: DetectedSource[];
  message?: string;
}

export async function postRoomScanApi(image: string, language: string): Promise<ScanApiResponse> {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, language }),
  });
  if (!res.ok) throw new Error(`Scan server error: ${res.status}`);
  return (await res.json()) as ScanApiResponse;
}

export function appendFixToCachedPlan(fix: ComputedFix, userProfile: UserProfile | null): boolean {
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    const lang = userProfile?.language || 'en';
    const loc = userProfile?.location?.name || 'city';
    const cacheKey = STORAGE_KEYS.planCache(`${dateStr}_${lang}_${loc}`);

    const newPlanItem: RawPlanItem = {
      time: 'Immediate',
      action: fix.fix,
      reason: `${fix.label}: ${fix.why}`,
      category: fix.category,
      hours: 4,
      before_pm25: fix.beforePm25,
      after_pm25: fix.afterPm25,
    };

    const existingCache = parsePlanCache(storage.getItem(cacheKey));
    const list: RawPlanItem[] = [newPlanItem, ...(existingCache?.items || [])];
    const preservedSource = existingCache?.source || 'offline';
    storage.setItem(cacheKey, serializePlanCache(preservedSource, list));
    return true;
  } catch (err) {
    logger.error('Failed to add fix to plan:', err);
    return false;
  }
}
