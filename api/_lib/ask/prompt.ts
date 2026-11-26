/**
 * Prompt builder and friendly localized fallback messages for `/api/ask`.
 */

import type { ForecastDataPoint } from '../../../shared/forecastWindow.js';
import type { RawPlanItem, UserProfile } from '../../../shared/types.js';
import { DAILY_QUESTION_LIMIT, type AskHistoryTurn, type AskResponseBody } from './schema.js';

export function getFriendlyFallbackMessage(language: string): string {
  if (language === 'hi') {
    return 'माफ़ कीजिए, अभी श्वास AI से संपर्क नहीं हो पा रहा है। कृपया कुछ देर बाद दोबारा पूछें या आज की वायु योजना देखें। यदि सांस लेने में तकलीफ़ या खाँसी हो, तो कृपया डॉक्टर से सलाह लें।';
  }
  return 'Sorry, I could not reach Gemini right now. Please try again in a moment, or check your Today tab for the cleanest air window. If anyone is experiencing coughing or breathing trouble, please consult a doctor.';
}

export function getRateLimitMessage(language: string): string {
  if (language === 'hi') {
    return `आप आज के ${DAILY_QUESTION_LIMIT} सवालों की सीमा तक पहुँच चुके हैं। कल फिर पूछें — तब तक अपनी दैनिक वायु योजना और स्वच्छ रास्ते देखें।`;
  }
  return `You've reached today's limit of ${DAILY_QUESTION_LIMIT} questions. Please check back tomorrow — your Today plan and Clean Routes remain available anytime.`;
}

export function buildEmptyQuestionResponse(language: string): AskResponseBody {
  return {
    answer:
      language === 'hi'
        ? 'कृपया वायु गुणवत्ता या परिवार के स्वास्थ्य से जुड़ा कोई सवाल पूछें।'
        : 'Please ask a question about air quality, masks, or your family routine.',
    source: 'offline',
    remainingToday: DAILY_QUESTION_LIMIT,
    limit: DAILY_QUESTION_LIMIT,
    error: 'empty_question',
  };
}

function summarizeFamily(profile?: UserProfile): string {
  if (!profile?.family || profile.family.length === 0) {
    return 'Adult user (no specific health flags listed)';
  }
  return profile.family
    .map((f) => {
      const flags: string[] = [];
      if (f.flags?.asthma) flags.push('asthma');
      if (f.flags?.heart) flags.push('heart condition');
      if (f.flags?.pregnancy) flags.push('pregnant');
      const flagSuffix = flags.length ? `, ${flags.join(', ')}` : '';
      return `${f.name} (age ${f.age}${flagSuffix}, ${f.routine?.hoursOutside ?? 1}h outside, ${f.routine?.hoursAway ?? 6}h away)`;
    })
    .join('; ');
}

export function buildAskPrompt(
  question: string,
  language: string,
  profile: UserProfile | undefined,
  currentPm25: number,
  currentAqi: number,
  forecast: ForecastDataPoint[],
  plan: RawPlanItem[],
  history?: AskHistoryTurn[],
): string {
  const homeSummary = profile?.home
    ? `windows facing road: ${profile.home.windowsFacingRoad}, purifier: ${profile.home.purifier}, chimney: ${profile.home.chimney}, fuel: ${profile.home.cookingFuel}, commute: ${profile.home.commuteMode}`
    : 'Standard urban apartment';

  const sampledForecast =
    forecast.length > 8 ? forecast.filter((_, idx) => idx % 3 === 0).slice(0, 8) : forecast;
  const forecastSummary =
    sampledForecast.length > 0
      ? sampledForecast
          .map((p) => `${p.fullTime || p.time}(${p.day}):PM2.5=${p.pm25},AQI=${p.usAqi}`)
          .join(' | ')
      : `Now:PM2.5=${currentPm25},AQI=${currentAqi}`;

  const planSummary =
    plan.length > 0
      ? plan
          .slice(0, 8)
          .map((p) => `${p.time}: ${String(p.action || '').slice(0, 72)}`)
          .join(' | ')
      : 'None';

  const historyText =
    Array.isArray(history) && history.length > 0
      ? history
          .slice(-4)
          .map((h) => `${h.role === 'user' ? 'U' : 'A'}: ${String(h.text || '').slice(0, 160)}`)
          .join('\n')
      : '';

  return `SYSTEM INSTRUCTIONS:
You are Shwas, a practical urban air quality assistant in India.
1. Answer briefly (2–3 short sentences) about air quality, masks, outdoor timing, ventilation, and family routines in "${language}".
2. NEVER give medical diagnoses; advise seeing a doctor for any symptoms.
3. Politely refuse unrelated topics and steer back to air quality.
4. Use only the provided forecast and plan numbers.

CONTEXT:
City: ${profile?.location?.name || 'Delhi NCR'} | Now: PM2.5 ${currentPm25} µg/m³, AQI ${currentAqi}
Family: ${summarizeFamily(profile)}
Home: ${homeSummary}
Next 24h (3h steps): ${forecastSummary}
Today's plan: ${planSummary}
${historyText ? `Recent chat:\n${historyText}\n` : ''}
QUESTION: "${question}"

Return STRICT JSON only:
{"answer":"short reply in ${language}","timeMentioned":"6:00 PM" or null,"targetHour":18 or null,"durationHours":1 or null}`;
}
