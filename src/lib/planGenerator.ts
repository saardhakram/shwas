/**
 * Shwas Daily Air Plan Generator
 *
 * Produces structured 6-8 action items tailored to the user's home, family health flags,
 * routine, and upcoming 24h air quality forecast.
 *
 * Used as:
 * 1. The guaranteed rule-based fallback when Gemini API is offline or returns invalid structure.
 * 2. The baseline for frontend savings calculations using savingFromAction.
 */

import { UserProfile, RawPlanItem, AirPlanItem } from '../types';
import { ForecastDataPoint, computeBestWindow } from './forecast';

/**
 * Raw (unrounded) cigarettes saved by a single action based on its duration in hours:
 * saving = (before_pm25 - after_pm25) * hours / 528
 */
function rawPlanItemSavings(item: RawPlanItem, defaultHours = 2): number {
  const hours = Math.max(0.5, item.hours ?? defaultHours);
  const diff = Math.max(0, item.before_pm25 - item.after_pm25);
  return (diff * hours) / 528;
}

/**
 * Calculates cigarettes saved by a single action based on its duration in hours:
 * saving = (before_pm25 - after_pm25) * hours / 528
 *
 * Formula derivation:
 * 22 µg/m³ for 24h = 1 cigarette => 22 * 24 = 528 (µg·h/m³ per cigarette).
 * Avoided particulate dose = (before_pm25 - after_pm25) * hours.
 * Avoided cigarettes = (before_pm25 - after_pm25) * hours / 528.
 */
export function calculatePlanItemSavings(
  item: RawPlanItem,
  defaultHours = 2
): number {
  return Number(rawPlanItemSavings(item, defaultHours).toFixed(1));
}

/**
 * Generates 6 to 8 rule-based plan items based on physical IAQ rules and the user's profile.
 */
export function generateRuleBasedPlan(
  profile: UserProfile,
  forecastPoints: ForecastDataPoint[] = []
): RawPlanItem[] {
  const isHindi = profile.language === 'hi';
  const bestWindow = forecastPoints.length > 0
    ? computeBestWindow(forecastPoints, new Date())
    : {
        label: '2:00 PM – 4:00 PM',
        startTime: '2:00 PM',
        avgPm25: 110,
        avgAqi: 175,
      };

  const hasVulnerable = profile.family.some(
    (f) => f.flags?.asthma || f.flags?.heart || f.flags?.pregnancy || f.age >= 65 || f.age <= 10
  );

  const isRoadFacing = Boolean(profile.home.windowsFacingRoad);
  const hasPurifier = Boolean(profile.home.purifier);
  const hasChimney = Boolean(profile.home.chimney);
  const commute = (profile.home.commuteMode || 'metro').toLowerCase();

  const plan: RawPlanItem[] = [];

  // 1. Morning commute peak seal (7:30 AM, 3h window)
  plan.push({
    time: '7:30 AM',
    category: 'seal',
    hours: 3,
    action: isHindi
      ? (isRoadFacing
          ? 'सड़क की तरफ की सभी बालकनी और खिड़कियां पूरी तरह बंद रखें'
          : 'सुबह के पीक समय बाहरी खिड़कियां बंद रखें')
      : (isRoadFacing
          ? 'Keep road-facing windows and balcony doors firmly shut'
          : 'Seal all exterior windows during morning rush hour'),
    reason: isHindi
      ? 'सुबह 7:30 - 10:00 बजे भारी ट्रक और डीजल वाहनों का धुआं अधिकतम रहता है।'
      : 'Morning vehicular and diesel freight exhaust creates severe particulate spikes.',
    before_pm25: isRoadFacing ? 320 : 270,
    after_pm25: 145,
  });

  // 2. Commute travel advice (8:45 AM, 1h trip)
  plan.push({
    time: '8:45 AM',
    category: 'commute',
    hours: 1,
    action: isHindi
      ? (commute === 'metro'
          ? 'अंडरग्राउंड येलो लाइन मेट्रो चुनें — फ़िल्टर्ड केबिन हवा प्रदूषण कम करती है'
          : 'सड़क पर ऑटो/बाइक की जगह मेट्रो लें या N95 मास्क अवश्य पहनें')
      : (commute === 'metro'
          ? 'Travel via underground Metro — filtered air cabin bypasses arterial exhaust'
          : 'Switch open auto/bike commute to Metro or wear a tight-fitting N95 mask'),
    reason: isHindi
      ? 'सड़क स्तर पर प्रदूषण केबिन यात्रा की तुलना में 3 से 5 गुना अधिक होता है।'
      : 'Direct tailpipe exposure on ring roads exposes commuters to 3-5x higher particulate matter.',
    before_pm25: 280,
    after_pm25: commute === 'metro' ? 70 : 95,
  });

  // 3. Best Window Airing & Cross-Ventilation (e.g. 2:00 PM, 0.5h window)
  plan.push({
    time: bestWindow.startTime || '2:00 PM',
    category: 'ventilate',
    hours: 0.5,
    action: isHindi
      ? `दिन के सबसे स्वच्छ समय (${bestWindow.label}) में कमरों की खिड़कियां 30 मिनट खोलें`
      : `Cross-ventilate living rooms during the day's best air window (${bestWindow.label})`,
    reason: isHindi
      ? `दोपहर में धूप निकलने से स्मॉग ऊपर उठता है और हवा अपेक्षाकृत स्वच्छ होती है (${bestWindow.avgPm25} µg/m³)।`
      : `Solar boundary-layer heating disperses ground-level smog to daily minimums (${bestWindow.avgPm25} µg/m³).`,
    before_pm25: 185,
    after_pm25: Math.max(40, bestWindow.avgPm25),
  });

  // 4. Kitchen / Cooking Exhaust (1:00 PM, 1.5h cooking)
  plan.push({
    time: '1:00 PM',
    category: 'routine',
    hours: 1.5,
    action: isHindi
      ? (hasChimney
          ? 'तड़का या तलने से 5 मिनट पहले किचन चिमनी तेज़ गति पर चलाएं'
          : 'खाना बनाते समय किचन का दरवाजा बंद रखें और एग्जॉस्ट फैन चालू रखें')
      : (hasChimney
          ? 'Run kitchen chimney on high speed 5 minutes before and after cooking'
          : 'Keep kitchen doors shut and exhaust fan running during frying/cooking'),
    reason: isHindi
      ? 'रसोई का तेल और धुआं अंदरूनी हवा में PM2.5 तेजी से बढ़ाता है।'
      : 'Unvented cooking oils and combustion particles create sharp indoor pollution spikes.',
    before_pm25: 160,
    after_pm25: hasChimney ? 65 : 85,
  });

  // 5. Vulnerable family care & kids play timing (4:30 PM, 2h window)
  plan.push({
    time: '4:30 PM',
    category: 'routine',
    hours: 2,
    action: isHindi
      ? (hasVulnerable
          ? 'शाम 5 बजे के बाद बुजुर्गों की सैर और बच्चों का आउटडोर खेल टालें'
          : 'शाम के ट्रैफिक से पहले बाहर के काम निपटा लें')
      : (hasVulnerable
          ? 'Schedule children outdoor play and elderly walks before 5:00 PM'
          : 'Complete outdoor errands before the 5:30 PM evening traffic peak'),
    reason: isHindi
      ? 'शाम ढलते ही तापमान गिरने से धुआं और पराली की धुंध सतह के पास जम जाती है।'
      : 'Evening temperature inversion traps vehicular and biomass smoke at ground breathing levels.',
    before_pm25: 275,
    after_pm25: 135,
  });

  // 6. Evening re-sealing before night rush (6:30 PM, 3.5h window)
  plan.push({
    time: '6:30 PM',
    category: 'seal',
    hours: 3.5,
    action: isHindi
      ? 'शाम 6:30 बजे से पहले सभी बालकनी के दरवाजे और खिड़कियां सील कर लें'
      : 'Firmly close all balcony doors and windows before 6:30 PM',
    reason: isHindi
      ? 'ठंडी रात की हवा बाहरी प्रदूषण को घरों के अंदर धकेलती है।'
      : 'Nighttime thermal cooling traps particulate matter close to residential streets.',
    before_pm25: 310,
    after_pm25: 155,
  });

  // 7. Overnight bedroom air protection (10:00 PM, 8h sleep)
  plan.push({
    time: '10:00 PM',
    category: 'purify',
    hours: 8,
    action: isHindi
      ? (hasPurifier
          ? 'सोते समय बेडरूम में HEPA एयर प्यूरीफायर स्लीप मोड पर चलाएं'
          : 'बेडरूम के दरवाजों के नीचे ड्राफ्ट स्टॉपर या तौलिया लगाकर सील करें')
      : (hasPurifier
          ? 'Run HEPA air purifier on sleep mode in bedrooms overnight'
          : 'Seal bedroom under-door draft gaps with draft stoppers or rolled towels'),
    reason: isHindi
      ? 'रात भर स्वच्छ हवा (PM2.5 < 60 µg/m³) फेफड़ों की सूजन कम करती है।'
      : 'Maintains restorative sleep air quality below 60 µg/m³ for 8 continuous hours.',
    before_pm25: 195,
    after_pm25: hasPurifier ? 50 : 90,
  });

  return plan;
}

/**
 * Converts RawPlanItems to interactive AirPlanItems with computed cigarette savings.
 *
 * When heroCigarettes is provided, item savings are scaled proportionally (using
 * largest-remainder rounding to 0.1 cigarettes) so their sum NEVER exceeds 70%
 * of heroCigarettes.
 */
export function buildEnrichedPlan(
  rawItems: RawPlanItem[],
  existingCompletedMap: Record<string, boolean> = {},
  heroCigarettes?: number
): AirPlanItem[] {
  const rawSavings = rawItems.map((item) => rawPlanItemSavings(item));
  const rawTotal = rawSavings.reduce((sum, val) => sum + val, 0);

  let finalTenths: number[];

  if (typeof heroCigarettes === 'number') {
    // Hard cap: sum of item savings <= 70% of heroCigarettes (floored to 0.1 so it never exceeds 70%)
    const capTenths =
      heroCigarettes > 0 ? Math.floor(heroCigarettes * 0.7 * 10 + 1e-9) : 0;

    if (capTenths <= 0 || rawTotal <= 0) {
      finalTenths = rawItems.map(() => 0);
    } else if (rawTotal * 10 > capTenths) {
      // Scale proportionally and distribute tenths using largest-remainder method
      const exactTenths = rawSavings.map((v) => (v / rawTotal) * capTenths);
      const floored = exactTenths.map((v) => Math.floor(v));
      let remaining = capTenths - floored.reduce((s, v) => s + v, 0);

      const indicesByRemainder = exactTenths
        .map((v, idx) => ({ idx, rem: v - floored[idx] }))
        .sort((a, b) => b.rem - a.rem);

      for (let i = 0; i < remaining && i < indicesByRemainder.length; i++) {
        floored[indicesByRemainder[i].idx] += 1;
      }
      finalTenths = floored;
    } else {
      // Unscaled tenths; if independent rounding pushes total above capTenths, trim smallest remainders
      const exactTenths = rawSavings.map((v) => v * 10);
      const rounded = exactTenths.map((v) => Math.round(v));
      let excess = rounded.reduce((s, v) => s + v, 0) - capTenths;
      if (excess > 0) {
        const candidates = exactTenths
          .map((v, idx) => ({ idx, overshoot: rounded[idx] - v }))
          .filter((c) => rounded[c.idx] > 0)
          .sort((a, b) => b.overshoot - a.overshoot);
        for (let i = 0; i < excess && i < candidates.length; i++) {
          rounded[candidates[i].idx] -= 1;
        }
      }
      finalTenths = rounded;
    }
  } else {
    finalTenths = rawSavings.map((v) => Math.round(v * 10));
  }

  return rawItems.map((item, index) => {
    const id = `plan_${index + 1}`;
    const cigarettesSaved = Number((finalTenths[index] / 10).toFixed(1));

    return {
      ...item,
      id,
      cigarettesSaved,
      completed: Boolean(existingCompletedMap[id]),
    };
  });
}

export interface CachedDailyPlan {
  source: string;
  items: RawPlanItem[];
  createdAt: string;
}

/**
 * Parses a cached daily plan from localStorage.
 * Gracefully migrates legacy plain-array entries to { source, items, createdAt }.
 */
export function parsePlanCache(raw: string | null): CachedDailyPlan | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return null;
      return {
        source: 'offline',
        items: parsed,
        createdAt: new Date().toISOString(),
      };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      return {
        source: typeof parsed.source === 'string' ? parsed.source : 'offline',
        items: parsed.items,
        createdAt:
          typeof parsed.createdAt === 'string'
            ? parsed.createdAt
            : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function serializePlanCache(source: string, items: RawPlanItem[]): string {
  const payload: CachedDailyPlan = {
    source,
    items,
    createdAt: new Date().toISOString(),
  };
  return JSON.stringify(payload);
}
