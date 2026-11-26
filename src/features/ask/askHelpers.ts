import type { ProfileFamilyMember } from '../../types';
import type { SpeechRecognitionConstructor } from '../../types/maps';

export interface MiniCardData {
  timeLabel: string;
  aqi: number;
  pm25: number;
  cigarettes: number;
  durationHours: number;
  level: 'good' | 'moderate' | 'high';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  miniCard?: MiniCardData | null;
  source?: 'gemini' | 'offline' | 'rate_limited';
}

export const SPEECH_LOCALE_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
};

export function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Builds personalized suggestion chips from the real family names & ages in the user profile.
 */
export function buildSuggestionChips(family?: ProfileFamilyMember[]): string[] {
  if (!family || family.length === 0) {
    return [
      'Can I walk at 6 PM?',
      'Best time to open windows today?',
      'Best mask for outdoor commute?',
    ];
  }

  const chips: string[] = [];

  const senior =
    family.find((m) => m.age >= 55) ||
    family.find((m) => m.flags?.heart) ||
    family.find((m) => m.id !== 'me' && m.name.toLowerCase() !== 'me' && m.age >= 18);

  if (senior) {
    chips.push(`Can ${senior.name} walk at 6 PM?`);
  } else {
    const first = family[0];
    const label = first.name.toLowerCase() === 'me' ? 'I' : first.name;
    chips.push(`Can ${label} walk at 6 PM?`);
  }

  const child =
    family.find((m) => m.age <= 16) || family.find((m) => m.flags?.asthma && m.id !== senior?.id);

  if (child) {
    chips.push(`Is it safe for ${child.name} to play outside?`);
    chips.push(`Best mask for ${child.name} (${child.age} yrs)?`);
  } else {
    chips.push('Best time to open windows today?');
    chips.push('Best N95 mask for heavy smog?');
  }

  return chips.slice(0, 3);
}
