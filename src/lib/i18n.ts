import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from '../locales/en.json';
import hiTranslation from '../locales/hi.json';
import teTranslation from '../locales/te.json';
import taTranslation from '../locales/ta.json';
import bnTranslation from '../locales/bn.json';
import mrTranslation from '../locales/mr.json';

const resources = {
  en: { translation: enTranslation },
  hi: { translation: hiTranslation },
  te: { translation: teTranslation },
  ta: { translation: taTranslation },
  bn: { translation: bnTranslation },
  mr: { translation: mrTranslation },
};

const savedLanguage =
  typeof window !== 'undefined' ? localStorage.getItem('shwas_lang') || 'en' : 'en';

function syncDocumentLang(lang: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang || 'en';
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

syncDocumentLang(savedLanguage);
i18n.on('languageChanged', syncDocumentLang);

export default i18n;
