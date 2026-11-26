import { useState, useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAirQuality } from '../../components/layout/AppLayout';
import { resizeImageForUpload } from '../../lib/imageUtils';
import { computeScanResults, type ComputedFix, type DetectedSource } from '../../lib/fixes';
import { parsePlanCache, serializePlanCache } from '../../lib/planGenerator';
import { logger } from '../../lib/logger';
import type { RawPlanItem } from '../../types';

const OFFLINE_DEMO_SOURCES: DetectedSource[] = [
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

interface ScanApiResponse {
  source?: 'gemini' | 'offline';
  room?: string;
  sources?: DetectedSource[];
  message?: string;
}

export function useRoomScan() {
  const { i18n } = useTranslation();
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

  const handleOpenPicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const applyScanData = (scanData: ScanApiResponse) => {
    setScanSource(scanData.source || 'offline');
    setDetectedRoom(scanData.room || 'room');

    let rawSources = scanData.sources || [];
    if (rawSources.length === 0 && scanData.source === 'offline') {
      setErrorMessage(
        scanData.message ||
          'Offline mode: could not reach Gemini Vision. Showing sample room audit.',
      );
      rawSources = OFFLINE_DEMO_SOURCES;
    }

    const { fixes, totalCigarettesSaved } = computeScanResults(
      rawSources,
      outdoorPm25 || 180,
      userProfile,
    );
    setComputedFixes(fixes);
    setTotalSaved(totalCigarettesSaved);
    if (fixes.length > 0) setSelectedFixId(fixes[0].id);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErrorMessage(null);
      setIsScanning(true);
      setSelectedFixId(null);

      const { dataUrl } = await resizeImageForUpload(file, 1024, 0.7);
      setImagePreview(dataUrl);

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          language: i18n.language || userProfile?.language || 'en',
        }),
      });

      if (!res.ok) throw new Error(`Scan server error: ${res.status}`);
      applyScanData((await res.json()) as ScanApiResponse);
    } catch (err: unknown) {
      logger.error('[ScanPage error]:', err);
      setErrorMessage('Could not analyze image. Please try again.');
      setScanSource('offline');
    } finally {
      setIsScanning(false);
    }
  };

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
      logger.error('Failed to add fix to plan:', e);
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

  return {
    fileInputRef,
    imagePreview,
    isScanning,
    scanSource,
    detectedRoom,
    computedFixes,
    totalSaved,
    selectedFixId,
    setSelectedFixId,
    addedFixIds,
    errorMessage,
    handleOpenPicker,
    handleFileChange,
    handleAddToPlan,
    handleReset,
  };
}
