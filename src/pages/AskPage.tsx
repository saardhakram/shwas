import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Send, Sparkles } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';

export const AskPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">
            {t('ask.title', 'Ask Shwas')}
          </h2>
          <p className="text-xs text-slate-400">
            {t('ask.subtitle', 'Ask anything about air quality, kids\' play, or elderly safety')}
          </p>
        </div>
        <Badge variant="mint" size="sm">Gemini Assistant</Badge>
      </div>

      <GlassCard className="p-4 space-y-3 min-h-[220px] flex flex-col justify-between">
        <div className="space-y-2">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs">
            <Sparkles className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
            <div className="text-slate-200">
              <span className="font-semibold text-teal-300">Namaste!</span> I can help tailor your family's routine. Ask me e.g. <em>"Can Dadi go for an evening walk today?"</em> or <em>"Is it safe for Aarav to play football at 5 PM?"</em>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-white/[0.08] flex items-center gap-2">
          <input
            type="text"
            placeholder="Type your question or tap mic..."
            className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/50"
            readOnly
          />
          <button
            type="button"
            className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300"
            title="Voice input"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-2 rounded-xl bg-teal-400 text-slate-950 font-semibold"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </GlassCard>
    </div>
  );
};

export default AskPage;
