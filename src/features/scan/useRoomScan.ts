import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAirQuality } from '../../components/layout/AppLayout';
import { resizeImageForUpload } from '../../lib/imageUtils';
import { computeScanResults, type ComputedFix } from '../../lib/fixes';
import { logger } from '../../lib/logger';
import {
  appendFixToCachedPlan,
  OFFLINE_DEMO_SOURCES,
  postRoomScanApi,
  type ScanApiResponse,
} from './scanPlanHelpers';

export function useRoomScan() {
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

  const handleOpenPicker = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const applyScanData = (scanData: ScanApiResponse) => {
    setScanSource(scanData.source || 'offline');
    setDetectedRoom(scanData.room || 'room');

    let rawSources = scanData.sources || [];
    if (rawSources.length === 0 && scanData.source === 'offline') {
      setErrorMessage(
        scanData.message ||
          t(
            'scan.offlineModeError',
            'Offline mode: could not reach Gemini Vision. Showing sample room audit.',
          ),
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
      const data = await postRoomScanApi(dataUrl, i18n.language || userProfile?.language || 'en');
      applyScanData(data);
    } catch (err: unknown) {
      logger.error('[ScanPage error]:', err);
      setErrorMessage(t('scan.analyzeError', 'Could not analyze image. Please try again.'));
      setScanSource('offline');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddToPlan = (fix: ComputedFix) => {
    if (appendFixToCachedPlan(fix, userProfile)) {
      setAddedFixIds((prev) => ({ ...prev, [fix.id]: true }));
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
