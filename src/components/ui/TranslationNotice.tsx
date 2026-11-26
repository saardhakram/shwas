import React from 'react';
import { useTranslation } from 'react-i18next';

export const TRANSLATION_FEEDBACK_URL =
  'https://github.com/saardhakram/shwas/issues/new?labels=translation&title=Translation%20issue';

interface TranslationNoticeProps {
  className?: string;
}

export const TranslationNotice: React.FC<TranslationNoticeProps> = ({ className = '' }) => {
  const { t } = useTranslation();

  return (
    <p className={`text-[11px] leading-relaxed text-slate-400 ${className}`.trim()}>
      {t('app.translationNoticePrefix', 'Translations are AI-assisted. Spot an error?')}{' '}
      <a
        href={TRANSLATION_FEEDBACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal-300 hover:text-teal-200 underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-sm"
      >
        {t('app.translationNoticeLink', 'Let us know.')}
        <span className="sr-only">
          {' '}
          {t(
            'app.translationNoticeLinkSr',
            '(report a translation issue on GitHub, opens in a new tab)',
          )}
        </span>
      </a>
    </p>
  );
};

export default TranslationNotice;
