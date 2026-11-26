import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { useRoomScan } from '../features/scan/useRoomScan';
import { ScanCaptureCard } from '../features/scan/ScanCaptureCard';
import { ScanResultsView } from '../features/scan/ScanResultsView';

export const ScanPage: React.FC = () => {
  const { t } = useTranslation();
  const scan = useRoomScan();

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-12">
      <input
        ref={scan.fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={t('scan.fileInputAria', 'Choose or capture room photo for indoor air scan')}
        className="hidden"
        onChange={scan.handleFileChange}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>{t('scan.title', 'Shwas Scan')}</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
              {t('scan.visionBadge', 'Vision')}
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            {t('scan.subtitle', 'AI-powered indoor pollution audit with Gemini Vision')}
          </p>
        </div>
        {scan.imagePreview && (
          <button
            type="button"
            onClick={scan.handleReset}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            title={t('scan.scanAnotherTitle', 'Scan another photo')}
            aria-label={t('scan.scanAnotherAria', 'Reset scan and choose another photo')}
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <ScanCaptureCard
        isScanning={scan.isScanning}
        hasImage={Boolean(scan.imagePreview)}
        onOpenPicker={scan.handleOpenPicker}
      />

      {scan.imagePreview && !scan.isScanning && (
        <ScanResultsView
          imagePreview={scan.imagePreview}
          detectedRoom={scan.detectedRoom}
          computedFixes={scan.computedFixes}
          totalSaved={scan.totalSaved}
          selectedFixId={scan.selectedFixId}
          addedFixIds={scan.addedFixIds}
          errorMessage={scan.errorMessage}
          scanSource={scan.scanSource}
          onSelectFix={scan.setSelectedFixId}
          onAddToPlan={scan.handleAddToPlan}
          onRetake={scan.handleOpenPicker}
        />
      )}

      <GlassCard variant="subtle" className="p-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
          <span>
            {t(
              'scan.disclaimerNote',
              'Reductions and cigarette math are calculated in code based on outdoor PM2.5 and your home profile.',
            )}
          </span>
        </div>
      </GlassCard>
    </div>
  );
};

export default ScanPage;
