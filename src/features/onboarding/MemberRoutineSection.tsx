import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import type { ProfileFamilyMember } from '../../types';

interface MemberRoutineSectionProps {
  family: ProfileFamilyMember[];
  selectedMemberIdx: number;
  onSelectMemberIdx: (idx: number) => void;
  onUpdateMemberRoutine: (idx: number, field: 'hoursOutside' | 'hoursAway', value: number) => void;
}

export const MemberRoutineSection: React.FC<MemberRoutineSectionProps> = ({
  family,
  selectedMemberIdx,
  onSelectMemberIdx,
  onUpdateMemberRoutine,
}) => {
  const { t } = useTranslation();
  const activeMember = family[selectedMemberIdx];

  return (
    <div className="space-y-2 pt-1">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />{' '}
        {t('onboarding.memberRoutineHeading', 'Member Routine Exposure')}
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
              <label htmlFor="onboarding-hours-outside">
                {t('onboarding.hoursOutdoors', 'Hours Outdoors (Commute, Market):')}
              </label>
              <strong className="text-teal-300 font-mono">
                {activeMember.routine.hoursOutside} {t('app.units.hrs', 'hrs')}
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
              <label htmlFor="onboarding-hours-away">
                {t('onboarding.hoursAway', 'Hours Away (Office / School):')}
              </label>
              <strong className="text-teal-300 font-mono">
                {activeMember.routine.hoursAway} {t('app.units.hrs', 'hrs')}
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
            <span>{t('onboarding.hoursRemainingHome', 'Hours remaining at home:')}</span>
            <strong className="text-white font-mono">
              {Math.max(0, 24 - activeMember.routine.hoursOutside - activeMember.routine.hoursAway)}{' '}
              {t('app.units.hrs', 'hrs')}
            </strong>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
