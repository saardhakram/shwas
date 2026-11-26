/**
 * Shared scientific, timing, caching, and model constants for Shwas.
 *
 * Pure module with zero browser or Node-only dependencies so it can be imported
 * safely by both frontend bundles (`src/`) and Vercel Node ESM endpoints (`api/`).
 */

/** Berkeley Earth cigarette equivalence: 22 µg/m³ PM2.5 over 24 hours ≈ 1 cigarette. */
export const PM25_PER_CIGARETTE_24H = 22;

/** Number of hours in a standard day. */
export const HOURS_PER_DAY = 24;

/** Combined PM2.5-hour denominator per cigarette (22 µg/m³ × 24 hours = 528). */
export const PM25_HOURS_PER_CIGARETTE = PM25_PER_CIGARETTE_24H * HOURS_PER_DAY;

/** Maximum share of daily baseline exposure that today's plan can claim to eliminate (70%). */
export const MAX_PLAN_SAVINGS_RATIO = 0.7;

/** Server-side and client-side daily plan cache time-to-live (6 hours). */
export const PLAN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Maximum age before an ML station forecast falls back to live Open-Meteo (6 hours). */
export const ML_FORECAST_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Maximum distance (km) from a trained Delhi ML station to use ML predictions. */
export const ML_STATION_MAX_DISTANCE_KM = 60;

/** Default primary Gemini model for server-side endpoints. */
export const GEMINI_DEFAULT_PRIMARY_MODEL = 'gemini-3.5-flash';

/** Default fallback Gemini model used on 429/503 or primary failure. */
export const GEMINI_DEFAULT_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

/** Default total server time budget for Gemini retry orchestration (ms). */
export const GEMINI_DEFAULT_BUDGET_MS = 20000;

/** Server time budget for `/api/plan` generation (ms). */
export const GEMINI_PLAN_BUDGET_MS = 25000;

/** Server time budget for `/api/ask` conversational Q&A (ms). */
export const GEMINI_ASK_BUDGET_MS = 35000;

/** Server time budget for `/api/scan` room vision audit (ms). */
export const GEMINI_SCAN_BUDGET_MS = 20000;

/** Client-side fetch timeout for `/api/plan` (ms). */
export const CLIENT_PLAN_TIMEOUT_MS = 28000;

/** Client-side fetch timeout for `/api/ask` (ms). */
export const CLIENT_ASK_TIMEOUT_MS = 40000;

/** Brand and chart SVG colour tokens shared by Recharts and map renderers. */
export const CHART_COLORS = {
  mint: '#2DD4BF',
  amber: '#F59E0B',
  red: '#EF4444',
  axis: '#64748B',
  surfaceBase: '#0B0F17',
} as const;
