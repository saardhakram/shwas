/**
 * Pure, runtime-agnostic rule-based daily air plan generator.
 * Safe to import from both browser code (Vite) and Node.js serverless functions (Vercel /api/*).
 */

import type { UserProfile, RawPlanItem } from './types.js';
import { computeBestWindow } from './forecastWindow.js';
import type { ForecastDataPoint } from './forecastWindow.js';

function pickText(isHindi: boolean, hi: string, en: string): string {
  return isHindi ? hi : en;
}

function buildMorningSealItem(isHindi: boolean, isRoadFacing: boolean): RawPlanItem {
  const action = isRoadFacing
    ? pickText(
        isHindi,
        'सड़क की तरफ की सभी बालकनी और खिड़कियां पूरी तरह बंद रखें',
        'Keep road-facing windows and balcony doors firmly shut',
      )
    : pickText(
        isHindi,
        'सुबह के पीक समय बाहरी खिड़कियां बंद रखें',
        'Seal all exterior windows during morning rush hour',
      );
  return {
    time: '7:30 AM',
    category: 'seal',
    hours: 3,
    action,
    reason: pickText(
      isHindi,
      'सुबह 7:30 - 10:00 बजे भारी ट्रक और डीजल वाहनों का धुआं अधिकतम रहता है।',
      'Morning vehicular and diesel freight exhaust creates severe particulate spikes.',
    ),
    before_pm25: isRoadFacing ? 320 : 270,
    after_pm25: 145,
  };
}

function buildCommuteItem(isHindi: boolean, commute: string): RawPlanItem {
  const isMetro = commute === 'metro';
  const action = isMetro
    ? pickText(
        isHindi,
        'अंडरग्राउंड येलो लाइन मेट्रो चुनें — फ़िल्टर्ड केबिन हवा प्रदूषण कम करती है',
        'Travel via underground Metro — filtered air cabin bypasses arterial exhaust',
      )
    : pickText(
        isHindi,
        'सड़क पर ऑटो/बाइक की जगह मेट्रो लें या N95 मास्क अवश्य पहनें',
        'Switch open auto/bike commute to Metro or wear a tight-fitting N95 mask',
      );
  return {
    time: '8:45 AM',
    category: 'commute',
    hours: 1,
    action,
    reason: pickText(
      isHindi,
      'सड़क स्तर पर प्रदूषण केबिन यात्रा की तुलना में 3 से 5 गुना अधिक होता है।',
      'Direct tailpipe exposure on ring roads exposes commuters to 3-5x higher particulate matter.',
    ),
    before_pm25: 280,
    after_pm25: isMetro ? 70 : 95,
  };
}

function buildVentilationItem(
  isHindi: boolean,
  bestWindow: { label: string; startTime: string; avgPm25: number },
): RawPlanItem {
  const beforePm25 = Math.max(185, Math.round(bestWindow.avgPm25) + 45);
  const afterPm25 = Math.max(40, Math.min(beforePm25 - 20, Math.round(bestWindow.avgPm25)));
  return {
    time: bestWindow.startTime || '2:00 PM',
    category: 'ventilate',
    hours: 0.5,
    action: pickText(
      isHindi,
      `दिन के सबसे स्वच्छ समय (${bestWindow.label}) में कमरों की खिड़कियां 30 मिनट खोलें`,
      `Cross-ventilate living rooms during the day's best air window (${bestWindow.label})`,
    ),
    reason: pickText(
      isHindi,
      `दोपहर में धूप निकलने से स्मॉग ऊपर उठता है और हवा अपेक्षाकृत स्वच्छ होती है (${bestWindow.avgPm25} µg/m³)।`,
      `Solar boundary-layer heating disperses ground-level smog to daily minimums (${bestWindow.avgPm25} µg/m³).`,
    ),
    before_pm25: beforePm25,
    after_pm25: afterPm25,
  };
}

function buildKitchenItem(isHindi: boolean, hasChimney: boolean): RawPlanItem {
  const action = hasChimney
    ? pickText(
        isHindi,
        'तड़का या तलने से 5 मिनट पहले किचन चिमनी तेज़ गति पर चलाएं',
        'Run kitchen chimney on high speed 5 minutes before and after cooking',
      )
    : pickText(
        isHindi,
        'खाना बनाते समय किचन का दरवाजा बंद रखें और एग्जॉस्ट फैन चालू रखें',
        'Keep kitchen doors shut and exhaust fan running during frying/cooking',
      );
  return {
    time: '1:00 PM',
    category: 'routine',
    hours: 1.5,
    action,
    reason: pickText(
      isHindi,
      'रसोई का तेल और धुआं अंदरूनी हवा में PM2.5 तेजी से बढ़ाता है।',
      'Unvented cooking oils and combustion particles create sharp indoor pollution spikes.',
    ),
    before_pm25: 160,
    after_pm25: hasChimney ? 65 : 85,
  };
}

function buildEveningCareItem(isHindi: boolean, hasVulnerable: boolean): RawPlanItem {
  const action = hasVulnerable
    ? pickText(
        isHindi,
        'शाम 5 बजे के बाद बुजुर्गों की सैर और बच्चों का आउटडोर खेल टालें',
        'Schedule children outdoor play and elderly walks before 5:00 PM',
      )
    : pickText(
        isHindi,
        'शाम के ट्रैफिक से पहले बाहर के काम निपटा लें',
        'Complete outdoor errands before the 5:30 PM evening traffic peak',
      );
  return {
    time: '4:30 PM',
    category: 'routine',
    hours: 2,
    action,
    reason: pickText(
      isHindi,
      'शाम ढलते ही तापमान गिरने से धुआं और पराली की धुंध सतह के पास जम जाती है।',
      'Evening temperature inversion traps vehicular and biomass smoke at ground breathing levels.',
    ),
    before_pm25: 275,
    after_pm25: 135,
  };
}

function buildEveningSealItem(isHindi: boolean): RawPlanItem {
  return {
    time: '6:30 PM',
    category: 'seal',
    hours: 3.5,
    action: pickText(
      isHindi,
      'शाम 6:30 बजे से पहले सभी बालकनी के दरवाजे और खिड़कियां सील कर लें',
      'Firmly close all balcony doors and windows before 6:30 PM',
    ),
    reason: pickText(
      isHindi,
      'ठंडी रात की हवा बाहरी प्रदूषण को घरों के अंदर धकेलती है।',
      'Nighttime thermal cooling traps particulate matter close to residential streets.',
    ),
    before_pm25: 310,
    after_pm25: 155,
  };
}

function buildOvernightItem(isHindi: boolean, hasPurifier: boolean): RawPlanItem {
  const action = hasPurifier
    ? pickText(
        isHindi,
        'सोते समय बेडरूम में HEPA एयर प्यूरीफायर स्लीप मोड पर चलाएं',
        'Run HEPA air purifier on sleep mode in bedrooms overnight',
      )
    : pickText(
        isHindi,
        'बेडरूम के दरवाजों के नीचे ड्राफ्ट स्टॉपर या तौलिया लगाकर सील करें',
        'Seal bedroom under-door draft gaps with draft stoppers or rolled towels',
      );
  return {
    time: '10:00 PM',
    category: 'purify',
    hours: 8,
    action,
    reason: pickText(
      isHindi,
      'रात भर स्वच्छ हवा (PM2.5 < 60 µg/m³) फेफड़ों की सूजन कम करती है।',
      'Maintains restorative sleep air quality below 60 µg/m³ for 8 continuous hours.',
    ),
    before_pm25: 195,
    after_pm25: hasPurifier ? 50 : 90,
  };
}

/**
 * Generates 7 rule-based plan items based on physical IAQ rules and the user's profile.
 */
export function generateRuleBasedPlan(
  profile: UserProfile,
  forecastPoints: ForecastDataPoint[] = [],
): RawPlanItem[] {
  const isHindi = profile.language === 'hi';
  const bestWindow =
    forecastPoints.length > 0
      ? computeBestWindow(forecastPoints, new Date())
      : { label: '2:00 PM – 4:00 PM', startTime: '2:00 PM', avgPm25: 110 };

  const hasVulnerable = profile.family.some(
    (f) => f.flags?.asthma || f.flags?.heart || f.flags?.pregnancy || f.age >= 65 || f.age <= 10,
  );

  return [
    buildMorningSealItem(isHindi, Boolean(profile.home.windowsFacingRoad)),
    buildCommuteItem(isHindi, (profile.home.commuteMode || 'metro').toLowerCase()),
    buildVentilationItem(isHindi, bestWindow),
    buildKitchenItem(isHindi, Boolean(profile.home.chimney)),
    buildEveningCareItem(isHindi, hasVulnerable),
    buildEveningSealItem(isHindi),
    buildOvernightItem(isHindi, Boolean(profile.home.purifier)),
  ];
}
