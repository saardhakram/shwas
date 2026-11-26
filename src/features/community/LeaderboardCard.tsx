import React from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Flame } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import { formatSavedCount, type LeaderboardEntry } from '../../lib/community';

interface LeaderboardCardProps {
  leaderboard: LeaderboardEntry[];
  currentUserId: string;
}

export const LeaderboardCard: React.FC<LeaderboardCardProps> = ({ leaderboard, currentUserId }) => {
  const { t } = useTranslation();

  return (
    <GlassCard className="p-4 space-y-3 border-white/[0.1]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            {t('community.leaderboard', 'Weekly Leaderboard')}
          </h2>
        </div>
        <span className="text-[10px] text-slate-400 text-right">
          {t('community.climbHint', 'Check items on Today to climb')}
        </span>
      </div>

      <div className="space-y-2">
        {leaderboard.map((member) => {
          const isMe = member.userId === currentUserId;
          return (
            <div
              key={member.userId}
              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs ${
                isMe ? 'bg-teal-500/15 border-teal-400/40' : 'bg-white/[0.04] border-white/[0.06]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    member.rank === 1
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                      : 'bg-white/[0.06] text-slate-300'
                  }`}
                >
                  {member.rank}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-white flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{member.displayName}</span>
                    {isMe && (
                      <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-full bg-teal-400/20 border border-teal-400/40 text-teal-200 shrink-0">
                        {t('community.youBadge', 'YOU')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                    <Flame className="w-3 h-3 shrink-0 fill-amber-400/30" aria-hidden="true" />
                    <span>
                      {member.streakDays > 0
                        ? t('community.streakDays', '{{days}}d streak', { days: member.streakDays })
                        : t('community.startStreak', 'Start streak today')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-teal-300">
                  {formatSavedCount(member.weeklySaved)} {t('app.units.cigs', 'cigs')}
                </div>
                <div className="text-[10px] text-slate-400">
                  {t('community.todayCount', '{{value}} today', {
                    value: formatSavedCount(member.todaySaved),
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};
