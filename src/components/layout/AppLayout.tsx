import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wind, ShieldAlert, Sparkles } from 'lucide-react';
import BottomNav from '../navigation/BottomNav';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import FamilyChips, { FamilyMemberOption } from '../ui/FamilyChips';
import Badge from '../ui/Badge';
import { initAnonymousAuth } from '../../lib/supabase';
import { UserProfile } from '../../types';

interface AirQualityContextType {
  aqi: number;
  pm25: number;
  cityName: string;
  selectedFamilyId: string;
  userProfile: UserProfile | null;
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
  setSelectedFamilyId: () => {},
  setAqi: () => {},
  setAirQuality: () => {},
  setCityName: () => {},
  reloadProfile: () => {},
});

export const useAirQuality = () => useContext(AirQualityContext);

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [aqi, setAqi] = useState<number>(214); // Live Open-Meteo US AQI
  const [pm25, setPm25] = useState<number>(180);
  const [cityName, setCityName] = useState<string>('Delhi NCR');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('all');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const reloadProfile = () => {
    try {
      const stored = localStorage.getItem('shwas_profile');
      if (stored) {
        const parsed: UserProfile = JSON.parse(stored);
        setUserProfile(parsed);
        if (parsed.location?.name) {
          setCityName(parsed.location.name);
        }
      }
    } catch (err) {
      console.warn('Profile read error:', err);
    }
  };

  useEffect(() => {
    reloadProfile();
    initAnonymousAuth().catch((err) => {
      console.warn('Anonymous auth init handled:', err);
    });
  }, [location.pathname]);

  // Compute dynamic atmospheric haze gradient based on real live AQI:
  // Severe (300+): Murky brown-grey smog haze
  // Very Poor (200-300): Deep smoky orange/brown
  // Poor (100-200): Amber dusk
  // Good/Moderate (<100): Clear dawn teal
  const getAtmosphereGradient = (currentAqi: number) => {
    if (currentAqi >= 300) {
      return {
        bg: 'from-[#2a1711] via-[#1c1615] to-[#0c0d12]',
        glow: 'rgba(180, 83, 9, 0.18)',
        badgeVariant: 'danger' as const,
        label: t('aqi.severe', 'Severe Smog'),
      };
    } else if (currentAqi >= 200) {
      return {
        bg: 'from-[#2b1810] via-[#1c1417] to-[#0c0d12]',
        glow: 'rgba(239, 68, 68, 0.14)',
        badgeVariant: 'danger' as const,
        label: t('aqi.veryPoor', 'Very Poor'),
      };
    } else if (currentAqi >= 100) {
      return {
        bg: 'from-[#241a0d] via-[#16171c] to-[#0c0d12]',
        glow: 'rgba(245, 158, 11, 0.12)',
        badgeVariant: 'warning' as const,
        label: t('aqi.poor', 'Poor'),
      };
    } else {
      return {
        bg: 'from-[#052222] via-[#091b22] to-[#0a0f18]',
        glow: 'rgba(45, 212, 191, 0.18)',
        badgeVariant: 'mint' as const,
        label: t('aqi.good', 'Clean Dawn Teal'),
      };
    }
  };

  const atmosphere = getAtmosphereGradient(aqi);
  const isOnboarding = location.pathname === '/onboarding';

  // Dynamic Family Chips from real user profile
  const dynamicFamilyChips: FamilyMemberOption[] = useMemo(() => {
    const list: FamilyMemberOption[] = [{ id: 'all', name: t('family.all', 'All Family') }];
    if (userProfile?.family && userProfile.family.length > 0) {
      userProfile.family.forEach((m) => {
        let tag: string | undefined;
        let tagType: 'asthma' | 'senior' | 'child' | 'default' = 'default';
        if (m.flags?.asthma) {
          tag = t('family.asthmaTag', 'Asthma');
          tagType = 'asthma';
        } else if (m.flags?.heart) {
          tag = t('family.seniorTag', 'Heart');
          tagType = 'senior';
        } else if (m.flags?.pregnancy) {
          tag = 'Pregnant';
          tagType = 'child';
        } else if (m.age >= 65) {
          tag = t('family.seniorTag', 'Senior');
          tagType = 'senior';
        } else if (m.age <= 10) {
          tag = t('family.childTag', 'Child');
          tagType = 'child';
        }

        list.push({
          id: m.id,
          name: `${m.name} (${m.age})`,
          tag,
          tagType,
        });
      });
    } else {
      list.push(
        { id: 'me', name: t('family.me', 'Me (32)') },
        { id: 'grandpa', name: t('family.grandpa', 'Grandpa (72)'), tag: t('family.seniorTag', 'Senior'), tagType: 'senior' },
        { id: 'child', name: t('family.child', 'Aarav (8)'), tag: t('family.asthmaTag', 'Asthma'), tagType: 'asthma' }
      );
    }
    return list;
  }, [userProfile, t]);

  return (
    <AirQualityContext.Provider
      value={{
        aqi,
        pm25,
        cityName,
        selectedFamilyId,
        userProfile,
        setSelectedFamilyId,
        setAqi: (newAqi) => setAqi(newAqi),
        setAirQuality: (newAqi, newPm25) => {
          setAqi(newAqi);
          setPm25(newPm25);
        },
        setCityName: (name) => setCityName(name),
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
            <header className="flex flex-col gap-3 pb-3 border-b border-white/[0.06] mb-4">
              <div className="flex items-center justify-between gap-2">
                {/* Brand / Logo & Real Location */}
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

                {/* Right controls: AQI pill & Language */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAqi(aqi >= 300 ? 45 : 342)}
                    title="Click to toggle between Severe Smog and Clean Dawn Teal demo atmosphere"
                    aria-label={`Current AQI ${aqi}, ${atmosphere.label}. Activate to preview severe vs clean air atmosphere`}
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

              {/* Family member chips from real user profile */}
              <FamilyChips
                selectedId={selectedFamilyId}
                onSelect={(id) => setSelectedFamilyId(id)}
                members={dynamicFamilyChips}
              />
            </header>
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
