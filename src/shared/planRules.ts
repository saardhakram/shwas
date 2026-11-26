/**
 * Pure, runtime-agnostic rule-based daily air plan generator.
 * Safe to import from both browser code (Vite) and Node.js serverless functions (Vercel /api/*).
 * Contains NO browser globals, NO import.meta.env, and NO Supabase client imports.
 */

import type { UserProfile, RawPlanItem } from '../types/index.js';
import { computeBestWindow } from './forecastWindow.js';
import type { ForecastDataPoint } from './forecastWindow.js';

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
