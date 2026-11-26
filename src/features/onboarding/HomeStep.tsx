import React from 'react';
import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import GlassCard from '../../components/ui/GlassCard';
import type { ProfileFamilyMember, ProfileHome } from '../../types';
import { MemberRoutineSection } from './MemberRoutineSection';

interface HomeStepProps {
  home: ProfileHome;
  family: ProfileFamilyMember[];
  selectedMemberIdx: number;
  onHomeChange: (home: ProfileHome) => void;
  onSelectMemberIdx: (idx: number) => void;
  onUpdateMemberRoutine: (idx: number, field: 'hoursOutside' | 'hoursAway', value: number) => void;
}

const COOKING_FUELS = [
  { id: 'lpg', key: 'onboarding.fuelLpg', fallback: 'LPG' },
  { id: 'electric', key: 'onboarding.fuelElectric', fallback: 'Electric' },
  { id: 'wood', key: 'onboarding.fuelWood', fallback: 'Biomass / Wood' },
] as const;

const COMMUTE_MODES = [
  { id: 'metro', key: 'onboarding.commuteMetro', fallback: 'Metro' },
  { id: 'auto', key: 'onboarding.commuteAuto', fallback: 'Auto' },
  { id: 'bus', key: 'onboarding.commuteBus', fallback: 'Bus' },
  { id: 'bike', key: 'onboarding.commuteBike', fallback: 'Bike' },
  { id: 'car', key: 'onboarding.commuteCar', fallback: 'Car' },
  { id: 'walk', key: 'onboarding.commuteWalk', fallback: 'Walk' },
] as const;

export const HomeStep: React.FC<HomeStepProps> = ({
  home,
  family,
  selectedMemberIdx,
  onHomeChange,
  onSelectMemberIdx,
  onUpdateMemberRoutine,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <Badge variant="mint" size="sm" className="mb-1">
          {t('onboarding.stepOf', 'Step {{step}} of 5', { step: 4 })}
        </Badge>
        <h1 className="text-xl font-bold font-display text-white">
          {t('onboarding.homeTitle', 'Home & Daily Routine')}
        </h1>
        <p className="text-xs text-slate-400">
          {t(
            'onboarding.homeSubtitle',
            'Building factors determine whether outdoor smog stays outside or seeps indoors.',
          )}
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />{' '}
          {t('onboarding.homeBuildingFactors', 'Home Building Factors')}
        </div>

        <GlassCard variant="subtle" className="p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <label htmlFor="home-windows-road" className="cursor-pointer">
              <div className="font-semibold text-white">
                {t('onboarding.windowsFaceRoad', 'Balcony / Windows Face Road')}
              </div>
              <div className="text-[11px] text-slate-400">
                {t('onboarding.windowsFaceRoadSub', '+20% traffic soot infiltration')}
              </div>
            </label>
            <input
              id="home-windows-road"
              type="checkbox"
              checked={home.windowsFacingRoad}
              onChange={(e) => onHomeChange({ ...home, windowsFacingRoad: e.target.checked })}
              className="w-4 h-4 accent-teal-400"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
            <label htmlFor="home-hepa-purifier" className="cursor-pointer">
              <div className="font-semibold text-white">
                {t('onboarding.hepaPurifier', 'HEPA Air Purifier at Home')}
              </div>
              <div className="text-[11px] text-slate-400">
                {t('onboarding.hepaPurifierSub', 'Clears 60% of indoor particulate matter')}
              </div>
            </label>
            <input
              id="home-hepa-purifier"
              type="checkbox"
              checked={home.purifier}
              onChange={(e) => onHomeChange({ ...home, purifier: e.target.checked })}
              className="w-4 h-4 accent-teal-400"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
            <label htmlFor="home-kitchen-chimney" className="cursor-pointer">
              <div className="font-semibold text-white">
                {t('onboarding.kitchenChimney', 'Kitchen Chimney / Exhaust')}
              </div>
              <div className="text-[11px] text-slate-400">
                {t('onboarding.kitchenChimneySub', 'Extracts 70% of cooking grease/smoke')}
              </div>
            </label>
            <input
              id="home-kitchen-chimney"
              type="checkbox"
              checked={home.chimney}
              onChange={(e) => onHomeChange({ ...home, chimney: e.target.checked })}
              className="w-4 h-4 accent-teal-400"
            />
          </div>

          <div className="pt-1 border-t border-white/[0.05]">
            <div className="font-semibold text-white mb-1">
              {t('onboarding.cookingFuel', 'Cooking Fuel')}
            </div>
            <div className="flex gap-2">
              {COOKING_FUELS.map((fuel) => (
                <button
                  key={fuel.id}
                  type="button"
                  onClick={() => onHomeChange({ ...home, cookingFuel: fuel.id })}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs border ${
                    home.cookingFuel === fuel.id
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-semibold'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                  }`}
                >
                  {t(fuel.key, fuel.fallback)}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1 border-t border-white/[0.05]">
            <div className="font-semibold text-white mb-1">
              {t('onboarding.primaryCommute', 'Primary Commute Mode')}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {COMMUTE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onHomeChange({ ...home, commuteMode: mode.id })}
                  className={`py-1 px-1.5 rounded-lg text-[11px] border ${
                    home.commuteMode === mode.id
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-semibold'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                  }`}
                >
                  {t(mode.key, mode.fallback)}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      <MemberRoutineSection
        family={family}
        selectedMemberIdx={selectedMemberIdx}
        onSelectMemberIdx={onSelectMemberIdx}
        onUpdateMemberRoutine={onUpdateMemberRoutine}
      />
    </div>
  );
};
