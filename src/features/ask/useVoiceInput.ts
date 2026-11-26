import { useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '../../lib/logger';
import type { SpeechRecognitionInstance, SpeechRecognitionResultEvent } from '../../types/maps';
import { getSpeechRecognitionCtor, SPEECH_LOCALE_MAP } from './askHelpers';

export function useVoiceInput(activeLang: string, onTranscript: (text: string) => void) {
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (err) {
        logger.warn('[Ask] Voice recognition cleanup notice:', err);
      }
    };
  }, []);

  const handleToggleVoice = () => {
    const SpeechRec = getSpeechRecognitionCtor();
    if (!SpeechRec) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        logger.warn('[Ask] Voice recognition stop notice:', err);
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
    } catch (err) {
      logger.warn('[Ask] Voice recognition start failed:', err);
      setIsListening(false);
    }
  };

  return { speechSupported, isListening, handleToggleVoice };
}
