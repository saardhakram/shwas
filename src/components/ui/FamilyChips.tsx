import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, User, ShieldAlert, HeartPulse, Baby } from 'lucide-react';

export interface FamilyMemberOption {
  id: string;
  name: string;
  age?: number;
  tag?: string;
  tagType?: 'asthma' | 'senior' | 'child' | 'default';
}

export interface FamilyChipsProps {
  selectedId: string;
  onSelect: (id: string) => void;
  members?: FamilyMemberOption[];
  className?: string;
}

export const FamilyChips: React.FC<FamilyChipsProps> = ({
  selectedId,
  onSelect,
  members,
  className = '',
}) => {
  const { t } = useTranslation();

  const defaultMembers: FamilyMemberOption[] = [
    { id: 'all', name: t('family.all', 'All Family') },
    { id: 'me', name: t('family.me', 'Me (32)') },
    { id: 'grandpa', name: t('family.grandpa', 'Grandpa (72)'), tag: t('family.seniorTag', 'Senior'), tagType: 'senior' },
    { id: 'child', name: t('family.child', 'Aarav (8)'), tag: t('family.asthmaTag', 'Asthma'), tagType: 'asthma' },
  ];

  const list = members && members.length > 0 ? members : defaultMembers;

  return (
    <div
      role="group"
      aria-label="Filter exposure by family member"
      className={`flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x scroll-smooth ${className}`}
    >
      {list.map((member) => {
        const isSelected = selectedId === member.id;
        return (
          <button
            key={member.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(member.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              isSelected
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm shadow-teal-500/20 ring-1 ring-teal-500/30'
                : 'bg-white/[0.04] text-slate-400 border-white/[0.07] hover:bg-white/[0.08] hover:text-slate-200'
            }`}
          >
            {member.id === 'all' ? (
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <User className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{member.name}</span>
            {member.tag && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full border flex items-center gap-0.5 ${
                  member.tagType === 'asthma'
                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : member.tagType === 'senior'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-white/10 text-slate-300 border-white/20'
                }`}
              >
                {member.tagType === 'asthma' && <HeartPulse className="w-2.5 h-2.5 inline" aria-hidden="true" />}
                {member.tagType === 'senior' && <ShieldAlert className="w-2.5 h-2.5 inline" aria-hidden="true" />}
                {member.tagType === 'child' && <Baby className="w-2.5 h-2.5 inline" aria-hidden="true" />}
                {member.tag}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default FamilyChips;
