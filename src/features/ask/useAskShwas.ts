import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAirQuality } from '../../components/layout/AppLayout';
import { fetchSmartForecast, type ForecastDataPoint } from '../../lib/forecast';
import { parsePlanCache } from '../../lib/planGenerator';
import { CLIENT_ASK_TIMEOUT_MS } from '../../shared/constants';
import type { RawPlanItem, UserProfile } from '../../types';
import type { SpeechRecognitionInstance, SpeechRecognitionResultEvent } from '../../types/maps';
import {
  SPEECH_LOCALE_MAP,
  buildSuggestionChips,
  getSpeechRecognitionCtor,
  type ChatMessage,
  type MiniCardData,
} from './askHelpers';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Namaste! Ask me about outdoor walks, kids’ play times, masks, or sealing your home today. I check your family profile and the next 24-hour forecast.',
};

function readCachedTodayPlan(lang: string, locName: string): RawPlanItem[] {
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    const cached = parsePlanCache(localStorage.getItem(`shwas_plan_${dateStr}_${lang}_${locName}`));
    return cached?.items?.length ? cached.items : [];
  } catch {
    return [];
  }
}

interface AskApiResult {
  answer?: string;
  miniCard?: MiniCardData | null;
  source?: 'gemini' | 'offline' | 'rate_limited';
  remainingToday?: number;
}

async function postAskApi(params: {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  userProfile: UserProfile | null;
  language: string;
  pm25: number;
  aqi: number;
  forecast: ForecastDataPoint[];
  plan: RawPlanItem[];
  signal: AbortSignal;
}): Promise<AskApiResult> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      userId: params.userProfile?.id || 'guest',
      history: params.history,
      profile: params.userProfile || {
        language: params.language,
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
      currentPm25: params.pm25,
      currentAqi: params.aqi,
      forecast: params.forecast,
      plan: params.plan,
    }),
    signal: params.signal,
  });

  if (!res.ok) throw new Error(`Ask API returned ${res.status}`);
  return (await res.json()) as AskApiResult;
}

function useVoiceInput(activeLang: string, onTranscript: (text: string) => void) {
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

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
      recognition.lang = SPEECH_LOCALE_MAP[activeLang] || 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: SpeechRecognitionResultEvent) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (transcript && typeof transcript === 'string') onTranscript(transcript);
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  return { speechSupported, isListening, handleToggleVoice };
}

export function useAskShwas() {
  const { i18n } = useTranslation();
  const { aqi, pm25, userProfile } = useAirQuality();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStillThinking, setIsStillThinking] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number>(20);
  const [forecast24h, setForecast24h] = useState<ForecastDataPoint[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeLang = userProfile?.language || i18n.language || 'en';
  const activeLocName = userProfile?.location?.name || 'city';
  const suggestionChips = useMemo(
    () => buildSuggestionChips(userProfile?.family),
    [userProfile?.family],
  );
  const todayPlan = useMemo(
    () => readCachedTodayPlan(activeLang, activeLocName),
    [activeLang, activeLocName],
  );

  const voice = useVoiceInput(activeLang, setInput);

  const profileLat = userProfile?.location?.lat || 28.6139;
  const profileLon = userProfile?.location?.lon || 77.209;

  useEffect(() => {
    let active = true;
    fetchSmartForecast(profileLat, profileLon).then((res) => {
      if (active) setForecast24h(res.points.slice(0, 24));
    });
    return () => {
      active = false;
    };
  }, [profileLat, profileLon]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const sendQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', text: trimmed };
    const nextHistory = [...messages, userMsg]
      .filter((m) => m.id !== 'welcome')
      .slice(-4)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);
    setIsStillThinking(false);

    const stillThinkingTimer = setTimeout(() => setIsStillThinking(true), 8000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_ASK_TIMEOUT_MS);

    try {
      const data = await postAskApi({
        question: trimmed,
        history: nextHistory,
        userProfile,
        language: activeLang,
        pm25,
        aqi,
        forecast: forecast24h,
        plan: todayPlan,
        signal: controller.signal,
      });

      if (typeof data.remainingToday === 'number') setRemainingToday(data.remainingToday);
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  return {
    messages,
    input,
    setInput,
    isSending,
    isStillThinking,
    remainingToday,
    suggestionChips,
    ...voice,
    messagesEndRef,
    sendQuestion,
    handleSubmit,
  };
}
