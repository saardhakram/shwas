import React, { createContext, useContext, useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wind, ShieldAlert, Sparkles } from 'lucide-react';
import BottomNav from '../navigation/BottomNav';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import FamilyChips from '../ui/FamilyChips';
import Badge from '../ui/Badge';
import { initAnonymousAuth } from '../../lib/supabase';

interface AirQualityContextType {
  aqi: number;
  pm25: number;
  cityName: string;
  selectedFamilyId: string;
  setSelectedFamilyId: (id: string) => void;
  setAqi: (aqi: number) => void;
}

const AirQualityContext = createContext<AirQualityContextType>({
  aqi: 342,
  pm25: 285,
  cityName: 'Delhi NCR',
  selectedFamilyId: 'all',
  setSelectedFamilyId: () => {},
  setAqi: () => {},
});

export const useAirQuality = () => useContext(AirQualityContext);

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [aqi, setAqi] = useState<number>(342); // Default to severe winter smog for hackathon context
  const [pm25, setPm25] = useState<number>(285);
  const [cityName] = useState<string>('Delhi NCR');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('all');

  // Supabase anonymous authentication on first load
  useEffect(() => {
    initAnonymousAuth().catch((err) => {
      console.warn('Anonymous auth init handled:', err);
    });
  }, []);

  // Compute dynamic atmospheric gradient based on AQI:
  // Severe (300+): Murky brown-grey smog haze
  // Very Poor (200-300): Deep smoky orange/brown
  // Poor (100-200): Amber dusk
  // Good/Moderate (<100): Clear dawn teal
  const getAtmosphereGradient = (currentAqi: number) => {
    if (currentAqi >= 300) {
      // Murky brown-grey haze
      return {
        bg: 'from-[#2a1711] via-[#1c1615] to-[#0c0d12]',
        glow: 'rgba(180, 83, 9, 0.16)',
        badgeVariant: 'danger' as const,
        label: t('aqi.severe', 'Severe Smog'),
      };
    } else if (currentAqi >= 200) {
      // Very Poor
      return {
        bg: 'from-[#2b1810] via-[#1c1417] to-[#0c0d12]',
        glow: 'rgba(239, 68, 68, 0.14)',
        badgeVariant: 'danger' as const,
        label: t('aqi.veryPoor', 'Very Poor'),
      };
    } else if (currentAqi >= 100) {
      // Poor / Amber
      return {
        bg: 'from-[#241a0d] via-[#16171c] to-[#0c0d12]',
        glow: 'rgba(245, 158, 11, 0.12)',
        badgeVariant: 'warning' as const,
        label: t('aqi.poor', 'Poor'),
      };
    } else {
      // Clear dawn teal
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

  return (
    <AirQualityContext.Provider
      value={{
        aqi,
        pm25,
        cityName,
        selectedFamilyId,
        setSelectedFamilyId,
        setAqi: (newAqi) => {
          setAqi(newAqi);
          setPm25(Math.round(newAqi * 0.8));
        },
      }}
    >
      <div
        className={`min-h-screen text-slate-100 bg-gradient-to-b ${atmosphere.bg} transition-colors duration-1000 relative selection:bg-teal-500/30 selection:text-teal-200`}
      >
        {/* Atmospheric atmospheric haze radial background glow */}
        <div
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-1000"
          style={{
            background: `radial-gradient(circle at 50% 12%, ${atmosphere.glow} 0%, rgba(11, 15, 23, 0) 65%)`,
          }}
        />

        {/* Central mobile frame container */}
        <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col px-4 pt-3 pb-24">
          {!isOnboarding && (
            <header className="flex flex-col gap-3 pb-3 border-b border-white/[0.06] mb-4">
              <div className="flex items-center justify-between">
                {/* Brand / Logo */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-sm shadow-teal-500/20">
                    <Wind className="w-4 h-4 animate-pulse-subtle" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 leading-none">
                      <span className="font-display font-bold text-base tracking-tight text-white">
                        Shwas
                      </span>
                      <span className="text-[11px] font-normal text-teal-400/80">
                        श्वास
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium tracking-wider">
                      {cityName}
                    </span>
                  </div>
                </div>

                {/* Right controls: AQI pill & Language */}
                <div className="flex items-center gap-2">
                  {/* Clickable AQI Pill that toggles between Severe smog & Clear Dawn Teal for demo preview */}
                  <button
                    type="button"
                    onClick={() => setAqi(aqi >= 300 ? 45 : 342)}
                    title="Click to toggle between Severe Smog and Clean Dawn Teal demo atmosphere"
                    className="group"
                  >
                    <Badge
                      variant={atmosphere.badgeVariant}
                      size="sm"
                      icon={
                        aqi >= 300 ? (
                          <ShieldAlert className="w-3 h-3 text-red-400" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-teal-300" />
                        )
                      }
                      className="cursor-pointer transition-transform group-hover:scale-105"
                    >
                      {aqi} {atmosphere.label}
                    </Badge>
                  </button>

                  <LanguageSwitcher />
                </div>
              </div>

              {/* Family member chips */}
              <FamilyChips
                selectedId={selectedFamilyId}
                onSelect={(id) => setSelectedFamilyId(id)}
              />
            </header>
          )}

          {/* Main Route Content */}
          <main className="flex-1">
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
