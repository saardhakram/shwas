import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  Send,
  Wind,
  Cigarette,
  Clock,
  Activity,
  Sparkles,
  User,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import { useAirQuality } from '../components/layout/AppLayout';
import { fetchSmartForecast, ForecastDataPoint } from '../lib/forecast';
import { parsePlanCache } from '../lib/planGenerator';
import { ProfileFamilyMember, RawPlanItem } from '../types';

interface MiniCardData {
  timeLabel: string;
  aqi: number;
  pm25: number;
  cigarettes: number;
  durationHours: number;
  level: 'good' | 'moderate' | 'high';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  miniCard?: MiniCardData | null;
  source?: 'gemini' | 'offline' | 'rate_limited';
}

/**
 * Builds personalized suggestion chips from the real family names & ages in the user profile.
 */
function buildSuggestionChips(family?: ProfileFamilyMember[]): string[] {
  if (!family || family.length === 0) {
    return [
      'Can I walk at 6 PM?',
      'Best time to open windows today?',
      'Best mask for outdoor commute?',
    ];
  }

  const chips: string[] = [];

  // 1. Senior / older member (age >= 55) or first non-self adult
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

  // 2. Child (age <= 16) or member with asthma
  const child =
    family.find((m) => m.age <= 16) ||
    family.find((m) => m.flags?.asthma && m.id !== senior?.id);

  if (child) {
    chips.push(`Is it safe for ${child.name} to play outside?`);
    chips.push(`Best mask for ${child.name} (${child.age} yrs)?`);
  } else {
    chips.push('Best time to open windows today?');
    chips.push('Best N95 mask for heavy smog?');
  }

  return chips.slice(0, 3);
}

const SPEECH_LOCALE_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
};

function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * Swirling-wind avatar badge for Shwas assistant bubbles (Stitch design).
 */
const ShwasWindAvatar: React.FC<{ spinning?: boolean }> = ({ spinning = false }) => (
  <div className="relative w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-teal-400/25 via-cyan-500/20 to-emerald-500/25 border border-teal-400/40 shadow-md shadow-teal-500/15">
    <span
      className={`absolute inset-0 rounded-full border border-dashed border-teal-300/40 ${
        spinning ? 'animate-spin' : ''
      }`}
    />
    <Wind className="w-4 h-4 text-teal-300 relative z-10" />
  </div>
);

export const AskPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { aqi, pm25, userProfile } = useAirQuality();

  // Session-only chat history (never persisted to localStorage)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Namaste! Ask me about outdoor walks, kids’ play times, masks, or sealing your home today. I check your family profile and the next 24-hour forecast.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStillThinking, setIsStillThinking] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number>(20);

  const suggestionChips = useMemo(
    () => buildSuggestionChips(userProfile?.family),
    [userProfile?.family]
  );

  // Voice (Web Speech API) state — button hidden completely if unsupported
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Live context for /api/ask (next 24h forecast + today's plan)
  const [forecast24h, setForecast24h] = useState<ForecastDataPoint[]>([]);
  const [todayPlan, setTodayPlan] = useState<RawPlanItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const lat = userProfile?.location?.lat || 28.6139;
    const lon = userProfile?.location?.lon || 77.209;

    fetchSmartForecast(lat, lon).then((res) => {
      if (active) setForecast24h(res.points.slice(0, 24));
    });

    // Load today's cached plan if present
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const lang = userProfile?.language || i18n.language || 'en';
      const loc = userProfile?.location?.name || 'city';
      const cacheKey = `shwas_plan_${dateStr}_${lang}_${loc}`;
      const cached = parsePlanCache(localStorage.getItem(cacheKey));
      if (cached?.items?.length) {
        setTodayPlan(cached.items);
      }
    } catch {
      // ignore storage errors
    }

    return () => {
      active = false;
    };
  }, [userProfile?.location?.lat, userProfile?.location?.lon, userProfile?.location?.name, userProfile?.language, i18n.language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const sendQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextHistory = [...messages, userMsg]
      .filter((m) => m.id !== 'welcome')
      .slice(-4)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);
    setIsStillThinking(false);

    const stillThinkingTimer = setTimeout(() => {
      setIsStillThinking(true);
    }, 8000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          userId: userProfile?.id || 'guest',
          history: nextHistory,
          profile: userProfile || {
            language: i18n.language || 'en',
            location: { lat: 28.6139, lon: 77.209, name: 'Delhi NCR' },
            family: [],
            home: {
              windowsFacingRoad: true,
              purifier: false,
              chimney: false,
              cookingFuel: 'lpg',
              commuteMode: 'metro',
            },
          },
          currentPm25: pm25,
          currentAqi: aqi,
          forecast: forecast24h,
          plan: todayPlan,
        }),
        signal: controller.signal,
      });

      clearTimeout(stillThinkingTimer);
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Ask API returned ${res.status}`);
      }

      const data = await res.json();
      if (typeof data.remainingToday === 'number') {
        setRemainingToday(data.remainingToday);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text:
            data.answer ||
            'Sorry, I could not generate a response right now. Please try again in a moment.',
          miniCard: data.miniCard || null,
          source: data.source,
        },
      ]);
    } catch {
      clearTimeout(stillThinkingTimer);
      clearTimeout(timeout);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: 'Sorry, I could not reach Shwas AI right now. Please try again in a moment, or check your Today plan for the cleanest air window.',
          source: 'offline',
        },
      ]);
    } finally {
      clearTimeout(stillThinkingTimer);
      clearTimeout(timeout);
      setIsSending(false);
      setIsStillThinking(false);
    }
  };

  const handleToggleVoice = () => {
    const SpeechRec = getSpeechRecognitionCtor();
    if (!SpeechRec) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      const langCode = userProfile?.language || i18n.language || 'en';
      recognition.lang = SPEECH_LOCALE_MAP[langCode] || 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (transcript && typeof transcript === 'string') {
          setInput(transcript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShwasWindAvatar spinning={isSending} />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white tracking-tight">
              {t('ask.title', 'Ask Shwas')}
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {t('ask.subtitle', 'Air quality & family routine guidance')}
            </p>
          </div>
        </div>
        <Badge variant="mint" size="sm" className="shrink-0 whitespace-nowrap font-mono">
          {remainingToday}/20 left
        </Badge>
      </div>

      {/* Suggestion Chips (dynamic from real family profile) */}
      <div
        role="group"
        aria-label="Suggested air quality questions"
        className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
      >
        {suggestionChips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={isSending}
            onClick={() => sendQuestion(chip)}
            className="px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-teal-500/15 border border-white/[0.1] hover:border-teal-400/40 text-xs text-slate-200 whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Sparkles className="w-3 h-3 text-teal-400 shrink-0" aria-hidden="true" />
            <span>{chip}</span>
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <GlassCard className="p-3.5 flex flex-col justify-between min-h-[380px] max-h-[58vh] border-white/[0.1]">
        {/* Message Feed */}
        <div
          role="log"
          aria-live="polite"
          aria-label="Ask Shwas conversation"
          className="flex-1 overflow-y-auto space-y-3 pr-1"
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && <ShwasWindAvatar />}

                <div
                  className={`max-w-[82%] space-y-2 ${
                    isUser
                      ? 'rounded-2xl rounded-tr-sm bg-teal-400 text-slate-950 px-3.5 py-2.5 text-xs font-medium shadow-md shadow-teal-500/15'
                      : 'rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/[0.1] text-slate-100 px-3.5 py-2.5 text-xs leading-relaxed'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Inline Mini Card with AQI & Cigarettes for the time asked about */}
                  {!isUser && msg.miniCard && (
                    <div className="mt-2 p-2.5 rounded-xl bg-[#0B0F17]/75 border border-white/[0.1] space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1 font-semibold text-slate-200">
                          <Clock className="w-3 h-3 text-teal-400" />
                          {msg.miniCard.timeLabel}
                          {msg.miniCard.durationHours !== 1
                            ? ` (${msg.miniCard.durationHours}h)`
                            : ' (1h outing)'}
                        </span>
                        <Badge
                          variant={
                            msg.miniCard.level === 'good'
                              ? 'mint'
                              : msg.miniCard.level === 'moderate'
                                ? 'warning'
                                : 'danger'
                          }
                          size="sm"
                          className="font-mono"
                        >
                          AQI {msg.miniCard.aqi}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-white/[0.06]">
                        <span className="flex items-center gap-1 text-slate-300">
                          <Activity className="w-3 h-3 text-teal-300" />
                          PM2.5 <strong className="text-white font-mono">{msg.miniCard.pm25}</strong> µg/m³
                        </span>
                        <span className="flex items-center gap-1 text-amber-300 font-mono font-semibold">
                          <Cigarette className="w-3.5 h-3.5 text-amber-400" />
                          {msg.miniCard.cigarettes.toFixed(2)} cigs
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center shrink-0 text-slate-300">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start gap-2.5">
              <ShwasWindAvatar spinning />
              <div className="rounded-2xl rounded-tl-sm bg-white/[0.05] border border-white/[0.08] px-3.5 py-2.5 text-xs text-teal-300 animate-pulse">
                {isStillThinking ? 'Still thinking…' : 'Checking forecast & thinking…'}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmit}
          className="pt-3 mt-3 border-t border-white/[0.08] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Ask Shwas an air quality question"
            placeholder={
              isListening
                ? t('ask.listening', 'Listening… speak your question')
                : t('ask.placeholder', 'Ask about walks, kids, masks, or rooms…')
            }
            disabled={isSending || remainingToday <= 0}
            className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/50 disabled:opacity-50"
          />

          {/* Voice Mic Button — hidden completely if Web Speech API is unsupported */}
          {speechSupported && (
            <button
              type="button"
              onClick={handleToggleVoice}
              disabled={isSending || remainingToday <= 0}
              className={`p-2.5 rounded-xl border transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                isListening
                  ? 'bg-red-500/20 border-red-400/60 text-red-300 animate-pulse'
                  : 'bg-white/[0.06] border-white/[0.1] hover:bg-white/[0.12] text-slate-300'
              }`}
              title={isListening ? 'Stop listening' : 'Speak your question'}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              {isListening ? <MicOff className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}

          <button
            type="submit"
            disabled={!input.trim() || isSending || remainingToday <= 0}
            className="p-2.5 rounded-xl bg-teal-400 hover:bg-teal-300 disabled:opacity-40 text-slate-950 font-semibold transition-colors shrink-0 shadow-md shadow-teal-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            title="Send question"
            aria-label="Send question"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
      </GlassCard>

      <p className="text-[10px] text-center text-slate-500">
        {t('ask.disclaimer', 'Session-only chat · Not medical advice — please consult a doctor for symptoms.')}
      </p>
    </div>
  );
};

export default AskPage;
