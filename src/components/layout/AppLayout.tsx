import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav from '../navigation/BottomNav';
import type { FamilyMemberOption } from '../ui/FamilyChips';
import { initAnonymousAuth } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import type { UserProfile } from '../../types';
import { buildFamilyChips, getAtmosphereGradient } from './atmosphere';
import { AppHeader } from './AppHeader';

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
  return storage.getJson<UserProfile>(STORAGE_KEYS.PROFILE);
}

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [aqi, setAqi] = useState<number>(214);
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

  useEffect(() => {
    fetch('/api/health', { method: 'GET' }).catch((err) => {
      logger.info('[AppLayout] Warmup health check skipped:', err);
    });
    initAnonymousAuth().catch((err) => {
      logger.warn('Anonymous auth init handled:', err);
    });
  }, []);

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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-lg focus:bg-teal-400 focus:text-slate-950 focus:text-xs focus:font-semibold"
        >
          {t('app.skipToContent', 'Skip to main content')}
        </a>

        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-1000"
          style={{
            background: `radial-gradient(circle at 50% 12%, ${atmosphere.glow} 0%, rgba(11, 15, 23, 0) 65%)`,
          }}
        />

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

          <main id="main-content" className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>

        {!isOnboarding && <BottomNav />}
      </div>
    </AirQualityContext.Provider>
  );
};

export default AppLayout;
