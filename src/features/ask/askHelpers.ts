import type { ProfileFamilyMember, TranslateFn } from '../../types';
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

const defaultT: TranslateFn = (_k: string, def: string, opts?: Record<string, unknown>) =>
  opts ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? '')) : def;

/**
 * Builds personalized suggestion chips from the real family names & ages in the user profile.
 */
export function buildSuggestionChips(
  family?: ProfileFamilyMember[],
  t: TranslateFn = defaultT,
): string[] {
  if (!family || family.length === 0) {
    return [
      t('ask.chipWalkDefault', 'Can I walk at 6 PM?'),
      t('ask.chipWindows', 'Best time to open windows today?'),
      t('ask.chipMaskCommute', 'Best mask for outdoor commute?'),
    ];
  }

  const chips: string[] = [];

  const senior =
    family.find((m) => m.age >= 55) ||
    family.find((m) => m.flags?.heart) ||
    family.find((m) => m.id !== 'me' && m.name.toLowerCase() !== 'me' && m.age >= 18);

  if (senior) {
    chips.push(t('ask.chipWalkMember', 'Can {{name}} walk at 6 PM?', { name: senior.name }));
  } else {
    const first = family[0];
    if (first.name.toLowerCase() === 'me') {
      chips.push(t('ask.chipWalkDefault', 'Can I walk at 6 PM?'));
    } else {
      chips.push(t('ask.chipWalkMember', 'Can {{name}} walk at 6 PM?', { name: first.name }));
    }
  }

  const child =
    family.find((m) => m.age <= 16) || family.find((m) => m.flags?.asthma && m.id !== senior?.id);

  if (child) {
    chips.push(
      t('ask.chipPlayChild', 'Is it safe for {{name}} to play outside?', { name: child.name }),
    );
    chips.push(
      t('ask.chipMaskChild', 'Best mask for {{name}} ({{age}} yrs)?', {
        name: child.name,
        age: child.age,
      }),
    );
  } else {
    chips.push(t('ask.chipWindows', 'Best time to open windows today?'));
    chips.push(t('ask.chipMaskSmog', 'Best N95 mask for heavy smog?'));
  }

  return chips.slice(0, 3);
}
