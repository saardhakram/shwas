import React, { useEffect, type RefObject } from 'react';
import { Download, MessageCircle, Share2, Wind, X } from 'lucide-react';
import { buildWhatsAppShareUrl, formatSavedCount } from '../../lib/community';

interface ShareDayModalProps {
  groupName: string;
  aqi: number;
  myTodaySaved: number;
  shareText: string;
  shareFeedback: string | null;
  isGeneratingShare: boolean;
  shareCardRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onNativeShare: () => void;
  onDownloadPng: () => void;
}

export const ShareDayModal: React.FC<ShareDayModalProps> = ({
  groupName,
  aqi,
  myTodaySaved,
  shareText,
  shareFeedback,
  isGeneratingShare,
  shareCardRef,
  onClose,
  onNativeShare,
  onDownloadPng,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const savedLabel = formatSavedCount(myTodaySaved);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-day-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close share dialog backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm cursor-default"
      />

      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface-popover border border-white/15 p-4 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 id="share-day-modal-title" className="text-sm font-bold text-white">
            Share My Day
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg"
            aria-label="Close share dialog"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div
          ref={shareCardRef}
          className="rounded-2xl p-5 bg-gradient-to-br from-surface-share-from via-surface-share-via to-surface-share-to border border-teal-400/40 text-center space-y-3 shadow-xl"
        >
          <div className="flex items-center justify-center gap-1.5 text-teal-300 text-xs font-bold tracking-wide uppercase">
            <Wind className="w-4 h-4 text-teal-400" aria-hidden="true" />
            <span>Shwas · Breathe Smarter</span>
          </div>

          <div className="py-2">
            <div className="font-numbers text-5xl font-bold text-white">{savedLabel}</div>
            <div className="text-sm font-semibold text-teal-200 mt-1">
              We saved {savedLabel} {savedLabel === '1' ? 'cigarette' : 'cigarettes'} today 💨
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-300 border-t border-white/10 pt-2.5">
            <span>{groupName}</span>
            <span>·</span>
            <span>AQI {aqi}</span>
            <span>·</span>
            <span className="text-teal-300 font-semibold">#Shwas</span>
          </div>
        </div>

        {shareFeedback && (
          <p className="text-[11px] text-teal-300 text-center" role="status">
            {shareFeedback}
          </p>
        )}

        <div className="space-y-2">
          <button
            type="button"
            disabled={isGeneratingShare}
            onClick={onNativeShare}
            className="w-full py-2.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            <span>{isGeneratingShare ? 'Preparing card…' : 'Share Card'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={buildWhatsAppShareUrl(shareText)}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={onDownloadPng}
              className="py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-slate-100 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
