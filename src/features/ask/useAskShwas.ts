import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAirQuality } from '../../components/layout/AppLayout';
import { fetchSmartForecast, type ForecastDataPoint } from '../../lib/forecast';
import { DEFAULT_WELCOME_TEXT, readCachedTodayPlan, requestAskReply } from './askApi';
import { buildSuggestionChips, type ChatMessage } from './askHelpers';
import { useVoiceInput } from './useVoiceInput';

export function useAskShwas() {
  const { t, i18n } = useTranslation();
  const { aqi, pm25, userProfile } = useAirQuality();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'welcome', role: 'assistant', text: t('ask.welcome', DEFAULT_WELCOME_TEXT) },
  ]);

  useEffect(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === 'welcome' ? { ...m, text: t('ask.welcome', DEFAULT_WELCOME_TEXT) } : m,
      ),
    );
  }, [t]);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStillThinking, setIsStillThinking] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number>(20);
  const [forecast24h, setForecast24h] = useState<ForecastDataPoint[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeLang = userProfile?.language || i18n.language || 'en';
  const activeLocName = userProfile?.location?.name || 'city';
  const suggestionChips = useMemo(
    () => buildSuggestionChips(userProfile?.family, t),
    [userProfile?.family, t],
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
      .map(({ role, text }) => ({ role, text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);
    setIsStillThinking(false);

    const stillThinkingTimer = setTimeout(() => setIsStillThinking(true), 8000);
    const { reply, remainingToday: nextRemaining } = await requestAskReply({
      question: trimmed,
      history: nextHistory,
      userProfile,
      language: activeLang,
      pm25,
      aqi,
      forecast: forecast24h,
      plan: todayPlan,
      emptyText: t('ask.errorEmpty', 'Sorry, I could not generate a response right now.'),
      offlineText: t('ask.errorOffline', 'Sorry, I could not reach Shwas AI right now.'),
    });

    clearTimeout(stillThinkingTimer);
    if (typeof nextRemaining === 'number') setRemainingToday(nextRemaining);
    setMessages((prev) => [...prev, reply]);
    setIsSending(false);
    setIsStillThinking(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
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
