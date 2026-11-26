import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import { useAskShwas } from '../features/ask/useAskShwas';
import { ChatMessageBubble, ShwasWindAvatar } from '../features/ask/ChatMessageBubble';
import { AskComposer } from '../features/ask/AskComposer';

export const AskPage: React.FC = () => {
  const { t } = useTranslation();
  const ask = useAskShwas();

  return (
    <div className="space-y-3 animate-in fade-in duration-300 pb-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShwasWindAvatar spinning={ask.isSending} />
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
          {t('ask.leftBadge', '{{count}}/20 left', { count: ask.remainingToday })}
        </Badge>
      </div>

      <div
        role="group"
        aria-label={t('ask.suggestionsAria', 'Suggested air quality questions')}
        className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
      >
        {ask.suggestionChips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={ask.isSending}
            onClick={() => ask.sendQuestion(chip)}
            className="px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-teal-500/15 border border-white/[0.1] hover:border-teal-400/40 text-xs text-slate-200 whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Sparkles className="w-3 h-3 text-teal-400 shrink-0" aria-hidden="true" />
            <span>{chip}</span>
          </button>
        ))}
      </div>

      <GlassCard className="p-3.5 flex flex-col justify-between min-h-[380px] max-h-[58vh] border-white/[0.1]">
        <div
          role="log"
          aria-live="polite"
          aria-label={t('ask.conversationAria', 'Ask Shwas conversation')}
          className="flex-1 overflow-y-auto space-y-3 pr-1"
        >
          {ask.messages.map((msg) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))}

          {ask.isSending && (
            <div className="flex items-start gap-2.5">
              <ShwasWindAvatar spinning />
              <div className="rounded-2xl rounded-tl-sm bg-white/[0.05] border border-white/[0.08] px-3.5 py-2.5 text-xs text-teal-300 animate-pulse">
                {ask.isStillThinking
                  ? t('today.stillThinking', 'Still thinking…')
                  : t('ask.thinkingChecking', 'Checking forecast & thinking…')}
              </div>
            </div>
          )}

          <div ref={ask.messagesEndRef} />
        </div>

        <AskComposer
          input={ask.input}
          isSending={ask.isSending}
          isListening={ask.isListening}
          remainingToday={ask.remainingToday}
          speechSupported={ask.speechSupported}
          onInputChange={ask.setInput}
          onToggleVoice={ask.handleToggleVoice}
          onSubmit={ask.handleSubmit}
        />
      </GlassCard>

      <p className="text-[10px] text-center text-slate-500">
        {t(
          'ask.disclaimer',
          'Session-only chat · Not medical advice — please consult a doctor for symptoms.',
        )}
      </p>
    </div>
  );
};

export default AskPage;
