import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  Sparkles,
  ShieldCheck,
  PlusCircle,
  CheckCircle2,
  RotateCcw,
  Flame,
  Wind,
  Layers,
  Info,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import { useAirQuality } from '../components/layout/AppLayout';
import { resizeImageForUpload } from '../lib/imageUtils';
import { computeScanResults, ComputedFix } from '../lib/fixes';
import { parsePlanCache, serializePlanCache } from '../lib/planGenerator';
import { RawPlanItem } from '../types';

export const ScanPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pm25: outdoorPm25, userProfile } = useAirQuality();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSource, setScanSource] = useState<'gemini' | 'offline' | null>(null);
  const [detectedRoom, setDetectedRoom] = useState<string>('room');
  const [computedFixes, setComputedFixes] = useState<ComputedFix[]>([]);
  const [totalSaved, setTotalSaved] = useState<number>(0);
  const [selectedFixId, setSelectedFixId] = useState<string | null>(null);
  const [addedFixIds, setAddedFixIds] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Trigger camera or file picker
  const handleOpenPicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErrorMessage(null);
      setIsScanning(true);
      setSelectedFixId(null);

      // 1. Resize in browser to max 1024px, JPEG 0.7 (well under 4MB)
      const { dataUrl } = await resizeImageForUpload(file, 1024, 0.7);
      setImagePreview(dataUrl);

      // 2. Call serverless /api/scan
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          language: i18n.language || userProfile?.language || 'en',
        }),
      });

      if (!res.ok) {
        throw new Error(`Scan server error: ${res.status}`);
      }

      const scanData = await res.json();
      setScanSource(scanData.source || 'offline');
      setDetectedRoom(scanData.room || 'room');

      let rawSources = scanData.sources || [];

      // If offline or empty sources returned from an error, provide a helpful demo fallback if needed
      if (rawSources.length === 0 && scanData.source === 'offline') {
        setErrorMessage(
          scanData.message || 'Offline mode: could not reach Gemini Vision. Showing sample room audit.'
        );
        rawSources = [
          {
            id: 'open_window_road',
            label: 'Road-Facing Window Ingress',
            box: { x: 0.15, y: 0.1, w: 0.35, h: 0.5 },
            confidence: 0.88,
          },
          {
            id: 'no_purifier',
            label: 'No Active Air Purifier',
            box: { x: 0.6, y: 0.45, w: 0.3, h: 0.4 },
            confidence: 0.82,
          },
        ];
      }

      // 3. Compute fixes & impact in code (never trusted to model)
      const { fixes, totalCigarettesSaved } = computeScanResults(
        rawSources,
        outdoorPm25 || 180,
        userProfile
      );

      setComputedFixes(fixes);
      setTotalSaved(totalCigarettesSaved);
      if (fixes.length > 0) {
        setSelectedFixId(fixes[0].id);
      }
    } catch (err: any) {
      console.error('[ScanPage error]:', err);
      setErrorMessage('Could not analyze image. Please try again.');
      setScanSource('offline');
    } finally {
      setIsScanning(false);
    }
  };

  // Add fix to today's plan in localStorage so Today tab reflects it immediately
  const handleAddToPlan = (fix: ComputedFix) => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const lang = userProfile?.language || 'en';
      const loc = userProfile?.location?.name || 'city';
      const cacheKey = `shwas_plan_${dateStr}_${lang}_${loc}`;

      const newPlanItem: RawPlanItem = {
        time: 'Immediate',
        action: fix.fix,
        reason: `${fix.label}: ${fix.why}`,
        category: fix.category,
        hours: 4,
        before_pm25: fix.beforePm25,
        after_pm25: fix.afterPm25,
      };

      const existingCache = parsePlanCache(localStorage.getItem(cacheKey));
      const list: RawPlanItem[] = [newPlanItem, ...(existingCache?.items || [])];
      const preservedSource = existingCache?.source || 'offline';
      localStorage.setItem(cacheKey, serializePlanCache(preservedSource, list));

      setAddedFixIds((prev) => ({ ...prev, [fix.id]: true }));
    } catch (e) {
      console.error('Failed to add fix to plan:', e);
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setComputedFixes([]);
    setTotalSaved(0);
    setScanSource(null);
    setSelectedFixId(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-12">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Choose or capture room photo for indoor air scan"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>{t('scan.title', 'Shwas Scan')}</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Vision
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            {t('scan.subtitle', 'AI-powered indoor pollution audit with Gemini Vision')}
          </p>
        </div>
        {imagePreview && (
          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            title="Scan another photo"
            aria-label="Reset scan and choose another photo"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Empty State / Photo Capture Hero */}
      {!imagePreview && (
        <GlassCard className="p-7 text-center flex flex-col items-center justify-center gap-4 border-dashed border-white/20">
          <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-lg shadow-teal-500/10" aria-hidden="true">
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-sm font-semibold text-white">
              {t('scan.scanHeading', 'Scan Room, Kitchen, or Window')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('scan.scanSubtitle', 'Snap a photo of your living room, unvented stove, incense corner, or street windows. Gemini Vision pinpoints sources and calculates your cigarette savings.')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenPicker}
            aria-label={t('scan.takePhoto', 'Take Photo / Choose Image')}
            className="px-5 py-2.5 rounded-xl bg-teal-400 text-slate-950 font-semibold text-xs flex items-center gap-2 hover:bg-teal-300 active:scale-95 transition-all shadow-lg shadow-teal-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>{t('scan.takePhoto', 'Take Photo / Choose Image')}</span>
          </button>

          <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-white/10 w-full justify-center">
            <span className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" /> Agarbatti & Stoves
            </span>
            <span className="flex items-center gap-1">
              <Wind className="w-3.5 h-3.5 text-teal-400" /> Road Ingress
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Dust & Filters
            </span>
          </div>
        </GlassCard>
      )}

      {/* Scanning loading state */}
      {isScanning && (
        <GlassCard className="p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-teal-400 border-t-transparent animate-spin mx-auto" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-300 animate-pulse" />
              <span>Analyzing photo with Gemini Vision...</span>
            </h4>
            <p className="text-xs text-slate-400">
              Detecting combustion sources, dust ingress, and unvented emissions.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Scan Result View */}
      {imagePreview && !isScanning && (
        <div className="space-y-4">
          {/* Photo with Hotspot Overlay */}
          <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black/40 shadow-2xl">
            <img
              src={imagePreview}
              alt="Scanned space"
              className="w-full h-auto max-h-[360px] object-contain block mx-auto"
            />

            {/* Glowing Hotspot Markers drawn from bounding boxes */}
            {computedFixes.map((item, idx) => {
              const isSelected = selectedFixId === item.id;
              const left = `${(item.box.x * 100).toFixed(1)}%`;
              const top = `${(item.box.y * 100).toFixed(1)}%`;
              const width = `${(item.box.w * 100).toFixed(1)}%`;
              const height = `${(item.box.h * 100).toFixed(1)}%`;

              return (
                <button
                  key={`${item.id}-${idx}`}
                  type="button"
                  onClick={() => setSelectedFixId(item.id)}
                  style={{ left, top, width, height }}
                  className={`absolute rounded-lg border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-amber-400 bg-amber-400/20 shadow-[0_0_15px_rgba(251,191,36,0.5)] z-20 scale-105'
                      : 'border-teal-400/80 bg-teal-400/10 hover:border-teal-300 hover:bg-teal-400/20 z-10'
                  }`}
                  aria-label={`Hotspot: ${item.label}`}
                >
                  <span
                    className={`absolute -top-3 -left-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                        : 'bg-teal-400 text-slate-950 ring-1 ring-white/50'
                    }`}
                  >
                    {idx + 1}
                  </span>
                </button>
              );
            })}

            {/* Hotspot legend / room tag */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
              <span className="px-2 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-medium text-slate-200 border border-white/10 uppercase tracking-wider">
                Room: {detectedRoom}
              </span>
              <span className="px-2 py-1 rounded-lg bg-teal-500/20 border border-teal-500/40 backdrop-blur-md text-[11px] font-semibold text-teal-300">
                {computedFixes.length} {computedFixes.length === 1 ? 'risk found' : 'risks found'}
              </span>
            </div>
          </div>

          {/* Error / Notice bar if any */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-200">
              <Info className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Summary Impact Bar */}
          <GlassCard className="p-3.5 bg-gradient-to-r from-teal-950/40 to-slate-900/60 border-teal-500/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-white">
                  {computedFixes.length} {computedFixes.length === 1 ? 'fix' : 'fixes'} found
                </div>
                <div className="text-[11px] text-teal-300">
                  Save up to <strong className="font-bold text-teal-200">{totalSaved} cigarettes/day</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenPicker}
                aria-label={t('scan.retake', 'Retake')}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs text-slate-200 hover:bg-white/20 transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('scan.retake', 'Retake')}</span>
              </button>
            </div>
          </GlassCard>

          {/* List of Glass Fix Cards */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-0.5">
              Recommended Fixes & Impact
            </div>

            {computedFixes.map((item, idx) => {
              const isSelected = selectedFixId === item.id;
              const isAdded = !!addedFixIds[item.id];

              return (
                <GlassCard
                  key={`${item.id}-${idx}`}
                  className={`p-4 transition-all space-y-3 ${
                    isSelected
                      ? 'border-amber-400/50 bg-amber-500/5 shadow-lg shadow-amber-500/5'
                      : 'border-white/10'
                  }`}
                  onClick={() => setSelectedFixId(item.id)}
                >
                  {/* Card Header: Source Name + Reduction Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-400/20 border border-teal-400/40 text-teal-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-white">{item.label}</h4>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                          Category: {item.category}
                        </span>
                      </div>
                    </div>

                    <Badge variant="mint" size="sm" className="whitespace-nowrap shrink-0">
                      −{item.reductionPercent}% indoor PM2.5 · −{item.cigarettesSaved} cigs
                    </Badge>
                  </div>

                  {/* Why it matters */}
                  <div className="text-xs text-slate-300 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-400 font-medium">Why it matters: </span>
                    {item.why}
                  </div>

                  {/* The Actionable Fix */}
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-teal-300 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                      <span>Actionable Fix</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{item.fix}</p>
                  </div>

                  {/* Add to my plan button */}
                  <div className="pt-1 flex items-center justify-between border-t border-white/5">
                    <div className="text-[11px] text-slate-400">
                      Indoor PM2.5: {item.beforePm25} → <span className="text-teal-300 font-semibold">{item.afterPm25} µg/m³</span>
                    </div>
                    <button
                      type="button"
                      disabled={isAdded}
                      aria-label={isAdded ? `${item.label} added to plan` : `Add ${item.label} fix to today's plan`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToPlan(item);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                        isAdded
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 cursor-default'
                          : 'bg-teal-400 text-slate-950 hover:bg-teal-300 active:scale-95 shadow-md shadow-teal-400/20'
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('scan.addedToPlan', 'Added to Plan')}</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('scan.addToPlan', 'Add to my plan')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          {/* AI vs Offline attribution label */}
          <div className="pt-2 text-center">
            <span className="text-[10px] text-slate-400 font-mono">
              {scanSource === 'gemini' ? '✦ Scanned by Gemini Vision' : '✦ Offline Audit'}
            </span>
          </div>
        </div>
      )}

      {/* Helper footnote card */}
      <GlassCard variant="subtle" className="p-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            Reductions and cigarette math are calculated in code based on outdoor PM2.5 and your home profile.
          </span>
        </div>
      </GlassCard>
    </div>
  );
};

export default ScanPage;
