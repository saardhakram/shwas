import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import { formatSavedCount } from '../../lib/community';
import { logger } from '../../lib/logger';

export function useShareCard(shareText: string, myTodaySaved: number) {
  const { t } = useTranslation();
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState<boolean>(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const ensureShareImage = async (): Promise<string | null> => {
    if (shareImageUrl) return shareImageUrl;
    if (!shareCardRef.current) return null;
    const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true });
    setShareImageUrl(dataUrl);
    return dataUrl;
  };

  const handleOpenShare = () => {
    setShowShareModal(true);
    setShareFeedback(null);
    setShareImageUrl(null);
    setIsGeneratingShare(true);

    setTimeout(async () => {
      try {
        if (shareCardRef.current) {
          const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true });
          setShareImageUrl(dataUrl);
        }
      } catch (err) {
        logger.warn('[Community] Share card PNG render notice:', err);
      } finally {
        setIsGeneratingShare(false);
      }
    }, 120);
  };

  const handleNativeShare = async () => {
    setShareFeedback(null);
    try {
      const dataUrl = await ensureShareImage();
      if (!navigator.share) {
        setShareFeedback(
          t(
            'community.shareUnsupported',
            'Web Share is not supported in this browser — use WhatsApp or Download below.',
          ),
        );
        return;
      }
      if (dataUrl && typeof fetch !== 'undefined') {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'shwas-day.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Shwas — Clean Air Progress',
            text: shareText,
            files: [file],
          });
          setShareFeedback(t('community.shareSuccess', 'Shared successfully!'));
          return;
        }
      }
      await navigator.share({ title: 'Shwas — Clean Air Progress', text: shareText });
      setShareFeedback(t('community.shareSuccess', 'Shared successfully!'));
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setShareFeedback(
          t('community.shareFallbackHint', 'Use WhatsApp or Download PNG below to share.'),
        );
      }
    }
  };

  const handleDownloadPng = async () => {
    try {
      const dataUrl = await ensureShareImage();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `shwas-saved-${formatSavedCount(myTodaySaved)}-cigs.png`;
      link.href = dataUrl;
      link.click();
      setShareFeedback(t('community.downloadSuccess', 'Downloaded card image!'));
    } catch (err) {
      logger.warn('[Community] Share card PNG export failed:', err);
      setShareFeedback(
        t('community.downloadError', 'Could not export image. Try WhatsApp share instead.'),
      );
    }
  };

  return {
    showShareModal,
    setShowShareModal,
    shareFeedback,
    isGeneratingShare,
    shareCardRef,
    handleOpenShare,
    handleNativeShare,
    handleDownloadPng,
  };
}
