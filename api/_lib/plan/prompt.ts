/**
 * Prompt builder, response validator, and defaults for `/api/plan`.
 */

import type { ForecastDataPoint } from '../../../shared/forecastWindow.js';
import type { RawPlanItem, UserProfile } from '../../../shared/types.js';
import type { GeminiClientError } from '../types.js';
import { isRecord } from '../types.js';

export const DEFAULT_PROFILE: UserProfile = {
  language: 'en',
  location: { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
  family: [
    {
      id: 'me',
      name: 'Me',
      age: 32,
      flags: {},
      routine: { hoursOutside: 2, hoursAway: 8, awayPlace: 'office' },
    },
  ],
  home: {
    windowsFacingRoad: true,
    purifier: true,
    chimney: true,
    cookingFuel: 'lpg',
    commuteMode: 'metro',
  },
};

export function buildPlanPrompt(profile: UserProfile, forecast: ForecastDataPoint[]): string {
  const next24h = forecast.slice(0, 24);
  const sampledForecast =
    next24h.length > 8 ? next24h.filter((_, idx) => idx % 3 === 0).slice(0, 8) : next24h;
  const forecastSummary =
    sampledForecast.length > 0
      ? sampledForecast
          .map((p) => `${p.fullTime || p.time}(${p.day}):PM2.5=${p.pm25},AQI=${p.usAqi}`)
          .join(' | ')
      : 'Morning PM2.5=320 | Afternoon PM2.5=120 | Evening PM2.5=290';

  const familySummary = profile.family
    .map((f) => {
      const tags = [
        f.flags.asthma ? 'asthma' : '',
        f.flags.heart ? 'heart' : '',
        f.flags.pregnancy ? 'pregnant' : '',
      ]
        .filter(Boolean)
        .join(',');
      const tagPart = tags ? `,${tags}` : '';
      return `${f.name}(${f.age}${tagPart},${f.routine.hoursOutside}h out,${f.routine.hoursAway}h away)`;
    })
    .join('; ');

  return `You are Shwas, an Indian urban air quality assistant. Build a concise daily air plan of 6 items strictly in language "${profile.language}".

PROFILE: City=${profile.location.name} | RoadWindows=${profile.home.windowsFacingRoad} | Purifier=${profile.home.purifier} | Chimney=${profile.home.chimney} | Fuel=${profile.home.cookingFuel} | Commute=${profile.home.commuteMode}
FAMILY: ${familySummary}
NEXT 24H (3h steps): ${forecastSummary}

Return ONLY a JSON array of 6 items (no markdown):
[{"time":"7:30 AM","action":"short instruction in ${profile.language}","reason":"short reason in ${profile.language}","category":"seal|ventilate|commute|purify|routine","hours":3,"before_pm25":280,"after_pm25":140}]
Rules: hours > 0; before_pm25 > after_pm25; keep action <= 12 words and reason <= 14 words.`;
}

export function parseValidatedPlanItems(rawText: string): RawPlanItem[] {
  const rawContent = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const parsed: unknown = JSON.parse(rawContent);
  const candidateList = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.plan)
      ? parsed.plan
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : [];

  if (!Array.isArray(candidateList) || candidateList.length < 5) {
    throw new Error(`Invalid item count: ${candidateList?.length}`);
  }

  return candidateList.map((rawItem, idx) => {
    const item = isRecord(rawItem) ? rawItem : {};
    const before = Number(item.before_pm25) || 200;
    const after = Number(item.after_pm25) || 100;
    const hours = typeof item.hours === 'number' && item.hours > 0 ? Number(item.hours) : 2;
    return {
      time: String(item.time || `${7 + idx * 2}:00 AM`),
      action: String(item.action || 'Clean air action'),
      reason: String(item.reason || 'Reduces particulate matter exposure.'),
      category: String(item.category || 'routine'),
      hours,
      before_pm25: Math.max(before, after + 20),
      after_pm25: Math.min(before - 20, after),
    };
  });
}

export function formatAttemptDetails(err: unknown): string {
  const clientErr = err as GeminiClientError;
  if (!Array.isArray(clientErr?.attempts)) return 'no_attempt_details';
  return clientErr.attempts
    .map((a) => `${a.model} status=${a.status} (${String(a.error || '').slice(0, 120)})`)
    .join(' | ');
}
