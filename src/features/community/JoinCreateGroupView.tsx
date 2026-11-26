import React, { type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Sparkles, Users } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Badge from '../../components/ui/Badge';
import { normalizeJoinCode } from '../../lib/community';

interface JoinCreateGroupViewProps {
  defaultFamilyLabel: string;
  familyNameInput: string;
  groupNameInput: string;
  joinCodeInput: string;
  formError: string | null;
  onFamilyNameChange: (val: string) => void;
  onGroupNameChange: (val: string) => void;
  onJoinCodeChange: (val: string) => void;
  onCreateGroup: (e: FormEvent) => void;
  onJoinGroup: (e: FormEvent) => void;
  onJoinDemo: () => void;
}

export const JoinCreateGroupView: React.FC<JoinCreateGroupViewProps> = ({
  defaultFamilyLabel,
  familyNameInput,
  groupNameInput,
  joinCodeInput,
  formError,
  onFamilyNameChange,
  onGroupNameChange,
  onJoinCodeChange,
  onCreateGroup,
  onJoinGroup,
  onJoinDemo,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">{t('community.title', 'Community')}</h2>
          <p className="text-xs text-slate-400">
            {t('community.subtitle', 'Track clean air savings with your society or school')}
          </p>
        </div>
        <Badge variant="mint" size="sm">
          Groups
        </Badge>
      </div>

      <GlassCard variant="subtle" className="p-3.5 space-y-1.5">
        <label
          htmlFor="community-family-name"
          className="text-[11px] font-semibold text-slate-300 block"
        >
          Your Family Display Name
        </label>
        <input
          id="community-family-name"
          type="text"
          value={familyNameInput}
          onChange={(e) => onFamilyNameChange(e.target.value)}
          placeholder={defaultFamilyLabel}
          aria-label="Your Family Display Name"
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400/50"
        />
      </GlassCard>

      {formError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200"
        >
          {formError}
        </div>
      )}

      <GlassCard className="p-4 space-y-3 border-white/[0.1]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-400" aria-hidden="true" />
          <h3 className="text-xs font-bold text-white">
            {t('community.createGroup', 'Create a Society or School Group')}
          </h3>
        </div>
        <p className="text-[11px] text-slate-400">
          Creates a private group with a 6-character join code you can share on WhatsApp.
        </p>
        <form onSubmit={onCreateGroup} className="flex gap-2">
          <label htmlFor="community-group-name" className="sr-only">
            Society or school group name
          </label>
          <input
            id="community-group-name"
            type="text"
            value={groupNameInput}
            onChange={(e) => onGroupNameChange(e.target.value)}
            placeholder="e.g. Green Park Society"
            aria-label="Society or school group name"
            className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/50"
          />
          <button
            type="submit"
            aria-label="Create community group"
            className="px-3.5 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('community.createBtn', 'Create')}</span>
          </button>
        </form>
      </GlassCard>

      <GlassCard className="p-4 space-y-3 border-white/[0.1]">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <h3 className="text-xs font-bold text-white">
            {t('community.joinGroup', 'Join with a 6-Character Code')}
          </h3>
        </div>
        <form onSubmit={onJoinGroup} className="flex gap-2">
          <label htmlFor="community-join-code" className="sr-only">
            6-character group join code
          </label>
          <input
            id="community-join-code"
            type="text"
            value={joinCodeInput}
            onChange={(e) => onJoinCodeChange(normalizeJoinCode(e.target.value))}
            maxLength={6}
            placeholder="e.g. GRNPK6"
            aria-label="6-character group join code"
            className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono tracking-widest uppercase text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/50"
          />
          <button
            type="submit"
            aria-label="Join community group with code"
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            {t('community.joinBtn', 'Join')}
          </button>
        </form>
      </GlassCard>

      <GlassCard variant="mint" className="p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-teal-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-hidden="true" />
            <span>Preview Green Park Society</span>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Explore a live leaderboard &amp; local alerts feed (code{' '}
            <span className="font-mono text-teal-300">GRNPK6</span>).
          </p>
        </div>
        <button
          type="button"
          onClick={onJoinDemo}
          aria-label="Join Green Park Society demo group"
          className="px-3 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 hover:bg-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Join Demo
        </button>
      </GlassCard>
    </div>
  );
};
