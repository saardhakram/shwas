import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Flame, Layers, Sparkles, Wind } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';

interface ScanCaptureCardProps {
  isScanning: boolean;
  hasImage: boolean;
  onOpenPicker: () => void;
}

export const ScanCaptureCard: React.FC<ScanCaptureCardProps> = ({
  isScanning,
  hasImage,
  onOpenPicker,
}) => {
  const { t } = useTranslation();

  if (isScanning) {
    return (
      <GlassCard className="p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-teal-400 border-t-transparent animate-spin mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-white flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-300 animate-pulse" aria-hidden="true" />
            <span>{t('scan.analyzingHeading', 'Analyzing photo with Gemini Vision...')}</span>
          </h2>
          <p className="text-xs text-slate-400">
            {t(
              'scan.analyzingSubtitle',
              'Detecting combustion sources, dust ingress, and unvented emissions.',
            )}
          </p>
        </div>
      </GlassCard>
    );
  }

  if (hasImage) return null;

  return (
    <GlassCard className="p-7 text-center flex flex-col items-center justify-center gap-4 border-dashed border-white/20">
      <div
        className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-lg shadow-teal-500/10"
        aria-hidden="true"
      >
        <Camera className="w-8 h-8" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h2 className="text-sm font-semibold text-white">
          {t('scan.scanHeading', 'Scan Room, Kitchen, or Window')}
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t(
            'scan.scanSubtitle',
            'Snap a photo of your living room, unvented stove, incense corner, or street windows. Gemini Vision pinpoints sources and calculates your cigarette savings.',
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenPicker}
        aria-label={t('scan.takePhoto', 'Take Photo / Choose Image')}
        className="px-5 py-2.5 rounded-xl bg-teal-400 text-slate-950 font-semibold text-xs flex items-center gap-2 hover:bg-teal-300 active:scale-95 transition-all shadow-lg shadow-teal-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Camera className="w-4 h-4" aria-hidden="true" />
        <span>{t('scan.takePhoto', 'Take Photo / Choose Image')}</span>
      </button>

      <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-white/10 w-full justify-center">
        <span className="flex items-center gap-1">
          <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />{' '}
          {t('scan.chipAgarbatti', 'Agarbatti & Stoves')}
        </span>
        <span className="flex items-center gap-1">
          <Wind className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />{' '}
          {t('scan.chipRoadIngress', 'Road Ingress')}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />{' '}
          {t('scan.chipDustFilters', 'Dust & Filters')}
        </span>
      </div>
    </GlassCard>
  );
};
