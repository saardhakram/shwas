import React from 'react';
import { Clock, Home } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import GlassCard from '../../components/ui/GlassCard';
import type { ProfileFamilyMember, ProfileHome } from '../../types';

interface HomeStepProps {
  home: ProfileHome;
  family: ProfileFamilyMember[];
  selectedMemberIdx: number;
  onHomeChange: (home: ProfileHome) => void;
  onSelectMemberIdx: (idx: number) => void;
  onUpdateMemberRoutine: (idx: number, field: 'hoursOutside' | 'hoursAway', value: number) => void;
}

const COOKING_FUELS = ['lpg', 'electric', 'wood'] as const;
const COMMUTE_MODES = ['metro', 'auto', 'bus', 'bike', 'car', 'walk'] as const;

interface RoutineSectionProps {
  family: ProfileFamilyMember[];
  selectedMemberIdx: number;
  onSelectMemberIdx: (idx: number) => void;
  onUpdateMemberRoutine: (idx: number, field: 'hoursOutside' | 'hoursAway', value: number) => void;
}

const MemberRoutineSection: React.FC<RoutineSectionProps> = ({
  family,
  selectedMemberIdx,
  onSelectMemberIdx,
  onUpdateMemberRoutine,
}) => {
  const activeMember = family[selectedMemberIdx];

  return (
    <div className="space-y-2 pt-1">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" /> Member Routine Exposure
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {family.map((mem, idx) => (
          <button
            key={mem.id}
            type="button"
            onClick={() => onSelectMemberIdx(idx)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${
              selectedMemberIdx === idx
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/50'
                : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
            }`}
          >
            {mem.name}
          </button>
        ))}
      </div>

      {activeMember && (
        <GlassCard variant="subtle" className="p-3 space-y-3 text-xs">
          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <label htmlFor="onboarding-hours-outside">Hours Outdoors (Commute, Market):</label>
              <strong className="text-teal-300 font-mono">
                {activeMember.routine.hoursOutside} hrs
              </strong>
            </div>
            <input
              id="onboarding-hours-outside"
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={activeMember.routine.hoursOutside}
              onChange={(e) =>
                onUpdateMemberRoutine(selectedMemberIdx, 'hoursOutside', parseFloat(e.target.value))
              }
              className="w-full accent-teal-400"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <label htmlFor="onboarding-hours-away">Hours Away (Office / School):</label>
              <strong className="text-teal-300 font-mono">
                {activeMember.routine.hoursAway} hrs
              </strong>
            </div>
            <input
              id="onboarding-hours-away"
              type="range"
              min="0"
              max="14"
              step="1"
              value={activeMember.routine.hoursAway}
              onChange={(e) =>
                onUpdateMemberRoutine(selectedMemberIdx, 'hoursAway', parseFloat(e.target.value))
              }
              className="w-full accent-teal-400"
            />
          </div>

          <div className="text-[11px] text-slate-400 border-t border-white/[0.05] pt-2 flex justify-between">
            <span>Hours remaining at home:</span>
            <strong className="text-white font-mono">
              {Math.max(0, 24 - activeMember.routine.hoursOutside - activeMember.routine.hoursAway)}{' '}
              hrs
            </strong>
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export const HomeStep: React.FC<HomeStepProps> = ({
  home,
  family,
  selectedMemberIdx,
  onHomeChange,
  onSelectMemberIdx,
  onUpdateMemberRoutine,
}) => (
  <div className="space-y-4 animate-in fade-in duration-200">
    <div>
      <Badge variant="mint" size="sm" className="mb-1">
        Step 4 of 5
      </Badge>
      <h2 className="text-xl font-bold font-display text-white">Home &amp; Daily Routine</h2>
      <p className="text-xs text-slate-400">
        Building factors determine whether outdoor smog stays outside or seeps indoors.
      </p>
    </div>

    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Home className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" /> Home Building Factors
      </div>

      <GlassCard variant="subtle" className="p-3 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <label htmlFor="home-windows-road" className="cursor-pointer">
            <div className="font-semibold text-white">Balcony / Windows Face Road</div>
            <div className="text-[11px] text-slate-400">+20% traffic soot infiltration</div>
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
            <div className="font-semibold text-white">HEPA Air Purifier at Home</div>
            <div className="text-[11px] text-slate-400">
              Clears 60% of indoor particulate matter
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
            <div className="font-semibold text-white">Kitchen Chimney / Exhaust</div>
            <div className="text-[11px] text-slate-400">Extracts 70% of cooking grease/smoke</div>
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
          <div className="font-semibold text-white mb-1">Cooking Fuel</div>
          <div className="flex gap-2">
            {COOKING_FUELS.map((fuel) => (
              <button
                key={fuel}
                type="button"
                onClick={() => onHomeChange({ ...home, cookingFuel: fuel })}
                className={`flex-1 py-1 px-2 rounded-lg text-xs capitalize border ${
                  home.cookingFuel === fuel
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-semibold'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                }`}
              >
                {fuel === 'wood' ? 'Biomass / Wood' : fuel}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-1 border-t border-white/[0.05]">
          <div className="font-semibold text-white mb-1">Primary Commute Mode</div>
          <div className="grid grid-cols-3 gap-1.5">
            {COMMUTE_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onHomeChange({ ...home, commuteMode: mode })}
                className={`py-1 px-1.5 rounded-lg text-[11px] capitalize border ${
                  home.commuteMode === mode
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-semibold'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                }`}
              >
                {mode}
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
