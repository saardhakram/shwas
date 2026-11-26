import React from 'react';
import { Cigarette, Sparkles, Wind } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import GlassCard from '../../components/ui/GlassCard';
import { calculateMemberDailyCigarettes } from '../../lib/cigarettes';
import type { ProfileFamilyMember, ProfileHome, ProfileLocation } from '../../types';

interface RevealStepProps {
  isCalculating: boolean;
  location: ProfileLocation;
  outdoorPm25: number;
  revealedCigarettes: number;
  targetCigarettes: number;
  family: ProfileFamilyMember[];
  home: ProfileHome;
}

export const RevealStep: React.FC<RevealStepProps> = ({
  isCalculating,
  location,
  outdoorPm25,
  revealedCigarettes,
  targetCigarettes,
  family,
  home,
}) => (
  <div className="space-y-4 animate-in fade-in duration-300">
    {isCalculating ? (
      <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-teal-400/40 animate-ping opacity-50" />
          <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-400/50 flex items-center justify-center text-teal-300 shadow-xl shadow-teal-500/30">
            <Wind className="w-8 h-8 animate-pulse" aria-hidden="true" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white font-display">Calculating your air...</h3>
          <p className="text-xs text-slate-400 mt-1">
            Fetching live Open-Meteo data for {location.name} and computing building infiltration.
          </p>
        </div>
      </div>
    ) : (
      <div className="space-y-4">
        <div>
          <Badge variant="danger" size="sm" className="mb-1">
            Air Exposure Analysis
          </Badge>
          <h2 className="text-xl font-bold font-display text-white">
            Your family&apos;s cigarette exposure
          </h2>
          <p className="text-xs text-slate-400">Based on 22 µg/m³ PM2.5 in a day = 1 cigarette.</p>
        </div>

        <GlassCard
          variant="danger"
          className="p-6 text-center space-y-3 bg-gradient-to-b from-[#2b1612]/90 to-[#1b1012]/90 border-red-500/30"
        >
          <div className="flex items-center justify-center gap-1.5 text-xs text-amber-300 font-medium">
            <Cigarette className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Your family breathes (per person average)</span>
          </div>

          <div className="flex items-baseline justify-center gap-2">
            <span className="font-numbers text-7xl font-bold tracking-tight text-white drop-shadow-lg">
              {revealedCigarettes.toFixed(1)}
            </span>
            <span className="text-lg font-sans text-slate-300 font-medium">cigarettes / day</span>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-teal-400" aria-hidden="true" />
            <span>
              {revealedCigarettes.toFixed(1)} → {targetCigarettes.toFixed(1)} with your daily air
              plan
            </span>
          </div>

          <div className="pt-2 text-[11px] text-slate-400 border-t border-white/[0.08]">
            Outdoor PM2.5: <strong className="text-white">{outdoorPm25} µg/m³</strong> in{' '}
            {location.name}
          </div>
        </GlassCard>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Exposure Per Member
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {family.map((mem) => {
              const cigs = calculateMemberDailyCigarettes(mem, outdoorPm25, home);
              return (
                <div
                  key={mem.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{mem.name}</span>
                    <span className="text-slate-400 text-[11px]">({mem.age} yrs)</span>
                  </div>
                  <div className="font-mono font-bold text-amber-300">
                    {cigs.toFixed(1)} cigs/day
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}
  </div>
);
