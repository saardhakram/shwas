import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wind, ShieldAlert, Sparkles } from 'lucide-react';
import BottomNav from '../navigation/BottomNav';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import FamilyChips, { FamilyMemberOption } from '../ui/FamilyChips';
import Badge from '../ui/Badge';
import { initAnonymousAuth } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { UserProfile } from '../../types';
import { buildFamilyChips, getAtmosphereGradient } from './atmosphere';

interface AirQualityContextType {
  aqi: number;
  pm25: number;
  cityName: string;
  selectedFamilyId: string;
  userProfile: UserProfile | null;
  isProfileReady: boolean;
  setSelectedFamilyId: (id: string) => void;
  setAqi: (aqi: number) => void;
  setAirQuality: (aqi: number, pm25: number) => void;
  setCityName: (name: string) => void;
  reloadProfile: () => void;
}

const AirQualityContext = createContext<AirQualityContextType>({
  aqi: 214,
  pm25: 180,
  cityName: 'Delhi NCR',
  selectedFamilyId: 'all',
  userProfile: null,
  isProfileReady: false,
  setSelectedFamilyId: () => {},
  setAqi: () => {},
  setAirQuality: () => {},
  setCityName: () => {},
  reloadProfile: () => {},
});

export const useAirQuality = () => useContext(AirQualityContext);

function readStoredProfile(): UserProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem('shwas_profile');
    if (stored) {
      return JSON.parse(stored) as UserProfile;
    }
  } catch (err) {
    logger.warn('Profile read error:', err);
  }
  return null;
}

const AppHeader: React.FC<{
  cityName: string;
  aqi: number;
  atmosphere: ReturnType<typeof getAtmosphereGradient>;
  selectedFamilyId: string;
  familyChips: FamilyMemberOption[];
  onToggleDemoAqi: () => void;
  onSelectFamily: (id: string) => void;
}> = ({
  cityName,
  aqi,
  atmosphere,
  selectedFamilyId,
  familyChips,
  onToggleDemoAqi,
  onSelectFamily,
}) => {
  const { t } = useTranslation();
  return (
    <header className="flex flex-col gap-3 pb-3 border-b border-white/[0.06] mb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-sm shadow-teal-500/20 shrink-0"
          >
            <Wind className="w-4 h-4 animate-pulse-subtle" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-display font-bold text-base tracking-tight text-white">
                Shwas
              </span>
              <span className="text-[11px] font-normal text-teal-400/80" aria-hidden="true">
                श्वास
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider truncate max-w-[120px] inline-block">
              {cityName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDemoAqi}
            title={t(
              'app.toggleDemoTitle',
              'Click to toggle between Severe Smog and Clean Dawn Teal demo atmosphere',
            )}
            aria-label={t(
              'app.toggleDemoAria',
              'Current AQI {{aqi}}, {{label}}. Activate to preview severe vs clean air atmosphere',
              { aqi, label: atmosphere.label },
            )}
            className="group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Badge
              variant={atmosphere.badgeVariant}
              size="sm"
              icon={
                aqi >= 300 ? (
                  <ShieldAlert className="w-3 h-3 text-red-400" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3 h-3 text-teal-300" aria-hidden="true" />
                )
              }
              className="cursor-pointer transition-transform group-hover:scale-105 font-mono"
            >
              {aqi} {atmosphere.label}
            </Badge>
          </button>

          <LanguageSwitcher />
        </div>
      </div>

      <FamilyChips selectedId={selectedFamilyId} onSelect={onSelectFamily} members={familyChips} />
    </header>
  );
};

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [aqi, setAqi] = useState<number>(214); // Live Open-Meteo US AQI
  const [pm25, setPm25] = useState<number>(180);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => readStoredProfile());
  const [cityName, setCityName] = useState<string>(
    () => readStoredProfile()?.location?.name || 'Delhi NCR',
  );
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('all');
  const [isProfileReady, setIsProfileReady] = useState<boolean>(true);

  const reloadProfile = useCallback(() => {
    const parsed = readStoredProfile();
    if (parsed) {
      setUserProfile(parsed);
      if (parsed.location?.name) {
        setCityName(parsed.location.name);
      }
    }
    setIsProfileReady(true);
  }, []);

  const handleSetAirQuality = useCallback((newAqi: number, newPm25: number) => {
    setAqi(newAqi);
    setPm25(newPm25);
  }, []);

  // Warm up Vercel serverless functions and initialize anonymous auth on initial load
  useEffect(() => {
    fetch('/api/health', { method: 'GET' }).catch(() => {
      // ignore warmup errors when offline
    });
    initAnonymousAuth().catch((err) => {
      logger.warn('Anonymous auth init handled:', err);
    });
  }, []);

  // Keep profile state in sync when onboarding or language switcher updates localStorage
  useEffect(() => {
    const onProfileChange = () => reloadProfile();
    window.addEventListener('shwas-profile-updated', onProfileChange);
    window.addEventListener('storage', onProfileChange);
    return () => {
      window.removeEventListener('shwas-profile-updated', onProfileChange);
      window.removeEventListener('storage', onProfileChange);
    };
  }, [reloadProfile]);

  const atmosphere = getAtmosphereGradient(aqi, t);
  const isOnboarding = location.pathname === '/onboarding';

  const dynamicFamilyChips: FamilyMemberOption[] = useMemo(
    () => buildFamilyChips(userProfile, t),
    [userProfile, t],
  );

  return (
    <AirQualityContext.Provider
      value={{
        aqi,
        pm25,
        cityName,
        selectedFamilyId,
        userProfile,
        isProfileReady,
        setSelectedFamilyId,
        setAqi,
        setAirQuality: handleSetAirQuality,
        setCityName,
        reloadProfile,
      }}
    >
      <div
        className={`min-h-screen overflow-x-hidden text-slate-100 bg-gradient-to-b ${atmosphere.bg} transition-colors duration-1000 relative selection:bg-teal-500/30 selection:text-teal-200`}
      >
        {/* Skip link for keyboard & screen-reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-lg focus:bg-teal-400 focus:text-slate-950 focus:text-xs focus:font-semibold"
        >
          {t('app.skipToContent', 'Skip to main content')}
        </a>

        {/* Atmospheric radial haze background glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-1000"
          style={{
            background: `radial-gradient(circle at 50% 12%, ${atmosphere.glow} 0%, rgba(11, 15, 23, 0) 65%)`,
          }}
        />

        {/* Central mobile frame container */}
        <div className="relative z-10 w-full max-w-md mx-auto min-h-screen flex flex-col px-4 pt-3 pb-24">
          {!isOnboarding && (
            <AppHeader
              cityName={cityName}
              aqi={aqi}
              atmosphere={atmosphere}
              selectedFamilyId={selectedFamilyId}
              familyChips={dynamicFamilyChips}
              onToggleDemoAqi={() => setAqi(aqi >= 300 ? 45 : 342)}
              onSelectFamily={setSelectedFamilyId}
            />
          )}

          {/* Main Route Content */}
          <main id="main-content" className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>

        {/* Bottom Navigation */}
        {!isOnboarding && <BottomNav />}
      </div>
    </AirQualityContext.Provider>
  );
};

export default AppLayout;
