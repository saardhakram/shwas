import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import type { UserProfile } from '../../types';
import { TranslationNotice } from './TranslationNotice';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
];

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    storage.setItem(STORAGE_KEYS.LANGUAGE, code);
    // Keep saved profile language in sync so Gemini replies match selected language
    const stored = storage.getJson<UserProfile>(STORAGE_KEYS.PROFILE);
    if (stored) {
      storage.setJson(STORAGE_KEYS.PROFILE, { ...stored, language: code });
      window.dispatchEvent(new Event('shwas-profile-updated'));
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('app.selectLanguageAria', 'Select language, current language {{language}}', {
          language: currentLang.native,
        })}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-slate-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        <Globe className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
        <span>{currentLang.native}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-surface-elevated border border-white/[0.14] shadow-2xl p-1.5 z-50">
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            {t('app.languages', 'Languages')}
          </div>
          <div role="listbox" aria-label={t('app.availableLanguages', 'Available languages')}>
            {LANGUAGES.map((lang) => {
              const isSelected = lang.code === currentLang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${lang.label} (${lang.native})`}
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                    isSelected
                      ? 'bg-teal-500/20 text-teal-300 font-semibold'
                      : 'text-slate-200 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span>{lang.native}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 pt-1.5 px-2 border-t border-white/[0.08]">
            <TranslationNotice />
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
