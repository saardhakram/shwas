import React from 'react';
import { Activity, Cigarette, Clock, User, Wind } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import type { ChatMessage } from './askHelpers';

export const ShwasWindAvatar: React.FC<{ spinning?: boolean }> = ({ spinning = false }) => (
  <div
    aria-hidden="true"
    className="relative w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-teal-400/25 via-cyan-500/20 to-emerald-500/25 border border-teal-400/40 shadow-md shadow-teal-500/15"
  >
    <span
      className={`absolute inset-0 rounded-full border border-dashed border-teal-300/40 ${
        spinning ? 'animate-spin' : ''
      }`}
    />
    <Wind className="w-4 h-4 text-teal-300 relative z-10" />
  </div>
);

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <ShwasWindAvatar />}

      <div
        className={`max-w-[82%] space-y-2 ${
          isUser
            ? 'rounded-2xl rounded-tr-sm bg-teal-400 text-slate-950 px-3.5 py-2.5 text-xs font-medium shadow-md shadow-teal-500/15'
            : 'rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/[0.1] text-slate-100 px-3.5 py-2.5 text-xs leading-relaxed'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>

        {!isUser && message.miniCard && (
          <div className="mt-2 p-2.5 rounded-xl bg-surface-base/75 border border-white/[0.1] space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-slate-200">
                <Clock className="w-3 h-3 text-teal-400" aria-hidden="true" />
                {message.miniCard.timeLabel}
                {message.miniCard.durationHours !== 1
                  ? ` (${message.miniCard.durationHours}h)`
                  : ' (1h outing)'}
              </span>
              <Badge
                variant={
                  message.miniCard.level === 'good'
                    ? 'mint'
                    : message.miniCard.level === 'moderate'
                      ? 'warning'
                      : 'danger'
                }
                size="sm"
                className="font-mono"
              >
                AQI {message.miniCard.aqi}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-white/[0.06]">
              <span className="flex items-center gap-1 text-slate-300">
                <Activity className="w-3 h-3 text-teal-300" aria-hidden="true" />
                PM2.5 <strong className="text-white font-mono">{message.miniCard.pm25}</strong>{' '}
                µg/m³
              </span>
              <span className="flex items-center gap-1 text-amber-300 font-mono font-semibold">
                <Cigarette className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                {message.miniCard.cigarettes.toFixed(2)} cigs
              </span>
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div
          aria-hidden="true"
          className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center shrink-0 text-slate-300"
        >
          <User className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
};
