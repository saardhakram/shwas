import { useState, type FormEvent } from 'react';
import type { AlertType, CommunityAlert, CommunityGroup } from '../../lib/community';
import { reportLocalAlert } from '../../lib/communityService';

export function useLocalAlertsForm(
  activeGroup: CommunityGroup | null,
  location: { lat?: number; lon?: number } | undefined,
  onAlertCreated: (alert: CommunityAlert) => void,
) {
  const [showReportForm, setShowReportForm] = useState<boolean>(false);
  const [alertType, setAlertType] = useState<AlertType>('garbage_burning');
  const [alertMessage, setAlertMessage] = useState<string>('');
  const [isSubmittingAlert, setIsSubmittingAlert] = useState<boolean>(false);

  const handleReportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !alertMessage.trim()) return;
    setIsSubmittingAlert(true);
    try {
      const saved = await reportLocalAlert(
        activeGroup.id,
        alertType,
        alertMessage,
        location?.lat,
        location?.lon,
      );
      onAlertCreated(saved);
      setAlertMessage('');
      setShowReportForm(false);
    } finally {
      setIsSubmittingAlert(false);
    }
  };

  return {
    showReportForm,
    setShowReportForm,
    alertType,
    setAlertType,
    alertMessage,
    setAlertMessage,
    isSubmittingAlert,
    handleReportSubmit,
  };
}
