import React from 'react';
import { Baby, HeartPulse, Plus, ShieldAlert, Trash2, User } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import GlassCard from '../../components/ui/GlassCard';
import type { HealthFlags, ProfileFamilyMember } from '../../types';

interface FamilyStepProps {
  family: ProfileFamilyMember[];
  newMemberName: string;
  newMemberAge: number;
  newMemberFlags: HealthFlags;
  onNewMemberNameChange: (name: string) => void;
  onNewMemberAgeChange: (age: number) => void;
  onNewMemberFlagsChange: (flags: HealthFlags) => void;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
}

export const FamilyStep: React.FC<FamilyStepProps> = ({
  family,
  newMemberName,
  newMemberAge,
  newMemberFlags,
  onNewMemberNameChange,
  onNewMemberAgeChange,
  onNewMemberFlagsChange,
  onAddMember,
  onRemoveMember,
}) => (
  <div className="space-y-4 animate-in fade-in duration-200">
    <div>
      <Badge variant="mint" size="sm" className="mb-1">
        Step 3 of 5
      </Badge>
      <h2 className="text-xl font-bold font-display text-white">Who breathes in your home?</h2>
      <p className="text-xs text-slate-400">
        Children and elders have smaller lung capacities and need tailored plan timings.
      </p>
    </div>

    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
      {family.map((mem) => (
        <GlassCard
          key={mem.id}
          variant="subtle"
          className="p-3 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
              <User className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {mem.name} ({mem.age} yrs)
              </div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {mem.flags?.asthma && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-0.5">
                    <HeartPulse className="w-2.5 h-2.5" aria-hidden="true" /> Asthma
                  </span>
                )}
                {mem.flags?.heart && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                    <ShieldAlert className="w-2.5 h-2.5" aria-hidden="true" /> Heart
                  </span>
                )}
                {mem.flags?.pregnancy && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 flex items-center gap-0.5">
                    <Baby className="w-2.5 h-2.5" aria-hidden="true" /> Pregnancy
                  </span>
                )}
              </div>
            </div>
          </div>

          {family.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveMember(mem.id)}
              aria-label={`Remove ${mem.name}`}
              className="text-slate-500 hover:text-red-400 p-1"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </GlassCard>
      ))}
    </div>

    <GlassCard className="p-3.5 space-y-2.5 border-teal-500/20 bg-teal-500/[0.04]">
      <div className="text-xs font-semibold text-teal-300 flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Family Member
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Name"
          aria-label="Family member name"
          value={newMemberName}
          onChange={(e) => onNewMemberNameChange(e.target.value)}
          className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-400"
        />
        <input
          type="number"
          placeholder="Age"
          aria-label="Family member age"
          value={newMemberAge}
          onChange={(e) => onNewMemberAgeChange(parseInt(e.target.value) || 0)}
          className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-400"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          type="button"
          onClick={() =>
            onNewMemberFlagsChange({ ...newMemberFlags, asthma: !newMemberFlags.asthma })
          }
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
            newMemberFlags.asthma
              ? 'bg-red-500/20 text-red-300 border-red-500/50'
              : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
          }`}
        >
          + Asthma / Bronchitis
        </button>
        <button
          type="button"
          onClick={() =>
            onNewMemberFlagsChange({ ...newMemberFlags, heart: !newMemberFlags.heart })
          }
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
            newMemberFlags.heart
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
          }`}
        >
          + Heart condition
        </button>
        <button
          type="button"
          onClick={() =>
            onNewMemberFlagsChange({ ...newMemberFlags, pregnancy: !newMemberFlags.pregnancy })
          }
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
            newMemberFlags.pregnancy
              ? 'bg-pink-500/20 text-pink-300 border-pink-500/50'
              : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
          }`}
        >
          + Pregnant
        </button>
      </div>

      <button
        type="button"
        onClick={onAddMember}
        className="w-full py-1.5 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 font-semibold text-xs rounded-lg transition-all"
      >
        Confirm Member
      </button>
    </GlassCard>
  </div>
);
