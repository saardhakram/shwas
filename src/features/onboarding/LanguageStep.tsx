import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { TranslationNotice } from '../../components/ui/TranslationNotice';
import { LANGUAGE_TILES } from './useOnboarding';

interface LanguageStepProps {
  language: string;
  onSelectLanguage: (code: string) => void;
}

export const LanguageStep: React.FC<LanguageStepProps> = ({ language, onSelectLanguage }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <Badge variant="mint" size="sm" className="mb-1">
          {t('onboarding.stepOf', 'Step {{step}} of 5', { step: 1 })}
        </Badge>
        <h1 className="text-xl font-bold font-display text-white">
          {t('onboarding.langTitle', 'Choose your language')}
        </h1>
        <p className="text-xs text-slate-400">
          {t(
            'onboarding.langSubtitle',
            'Shwas will guide your daily routine in your preferred language.',
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 pt-2">
        {LANGUAGE_TILES.map((lang) => {
          const isSelected = language === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectLanguage(lang.code)}
              className={`p-4 rounded-2xl text-left border transition-all duration-200 relative ${
                isSelected
                  ? 'bg-teal-500/20 border-teal-400/60 shadow-lg shadow-teal-500/20 ring-1 ring-teal-400'
                  : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08]'
              }`}
            >
              <div className="text-lg font-bold text-white mb-0.5">{lang.native}</div>
              <div className="text-xs text-slate-400 font-medium">{lang.subtitle}</div>
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-teal-400 text-slate-950 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <TranslationNotice className="text-center pt-1" />
    </div>
  );
};
