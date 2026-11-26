import React, { type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Send } from 'lucide-react';

interface AskComposerProps {
  input: string;
  isSending: boolean;
  isListening: boolean;
  remainingToday: number;
  speechSupported: boolean;
  onInputChange: (val: string) => void;
  onToggleVoice: () => void;
  onSubmit: (e: FormEvent) => void;
}

export const AskComposer: React.FC<AskComposerProps> = ({
  input,
  isSending,
  isListening,
  remainingToday,
  speechSupported,
  onInputChange,
  onToggleVoice,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <form
      onSubmit={onSubmit}
      className="pt-3 mt-3 border-t border-white/[0.08] flex items-center gap-2"
    >
      <input
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        aria-label="Ask Shwas an air quality question"
        placeholder={
          isListening
            ? t('ask.listening', 'Listening… speak your question')
            : t('ask.placeholder', 'Ask about walks, kids, masks, or rooms…')
        }
        disabled={isSending || remainingToday <= 0}
        className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/50 disabled:opacity-50"
      />

      {speechSupported && (
        <button
          type="button"
          onClick={onToggleVoice}
          disabled={isSending || remainingToday <= 0}
          className={`p-2.5 rounded-xl border transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
            isListening
              ? 'bg-red-500/20 border-red-400/60 text-red-300 animate-pulse'
              : 'bg-white/[0.06] border-white/[0.1] hover:bg-white/[0.12] text-slate-300'
          }`}
          title={isListening ? 'Stop listening' : 'Speak your question'}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
        >
          {isListening ? (
            <MicOff className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Mic className="w-4 h-4" aria-hidden="true" />
          )}
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
  );
};
