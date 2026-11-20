import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wind, Shield, Users, ArrowRight, CheckCircle2 } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Badge from '../components/ui/Badge';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';

export const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleCompleteOnboarding = () => {
    // Persist profile to localStorage to complete onboarding check
    const demoProfile = {
      cityName: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.2090,
      home: {
        windowsFacingRoad: true,
        purifier: true,
        chimney: true,
        cookingFuel: 'lpg',
        windowsShut: true,
      },
      familyMembers: [
        { id: 'me', name: 'Me (32)', age: 32, relation: 'self' },
        { id: 'grandpa', name: 'Grandpa (72)', age: 72, relation: 'parent', hasHeartCondition: true },
        { id: 'child', name: 'Aarav (8)', age: 8, relation: 'child', hasAsthma: true },
      ],
      onboardingCompleted: true,
    };

    localStorage.setItem('shwas_profile', JSON.stringify(demoProfile));
    navigate('/today');
  };

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-8 flex flex-col justify-between animate-in fade-in duration-300">
      <div className="space-y-6">
        {/* Top header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300">
              <Wind className="w-5 h-5 animate-pulse-subtle" />
            </div>
            <div>
              <span className="font-display font-bold text-lg text-white">Shwas</span>
              <span className="text-xs text-teal-400 ml-1 font-normal">श्वास</span>
            </div>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Hero message */}
        <div className="space-y-2">
          <Badge variant="mint" size="sm">
            Urban Air Quality Assistant
          </Badge>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight leading-tight">
            Turn invisible smog into actionable protection for your family.
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Breathing 22 µg/m³ of PM2.5 in a day equals smoking 1 cigarette.
            Shwas calculates your family's real exposure and builds a daily plan to bring it down.
          </p>
        </div>

        {/* Quick Value Cards */}
        <div className="space-y-2.5">
          <GlassCard variant="subtle" className="flex items-start gap-3 p-3">
            <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <h4 className="font-semibold text-slate-200">Daily Air Plan</h4>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Exact windows to ventilate, commute safely, and schedule kids' activities.
              </p>
            </div>
          </GlassCard>

          <GlassCard variant="subtle" className="flex items-start gap-3 p-3">
            <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <h4 className="font-semibold text-slate-200">Family-Specific Exposure</h4>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Individual calculations for elders, children with asthma, and daily commuters.
              </p>
            </div>
          </GlassCard>

          <GlassCard variant="subtle" className="flex items-start gap-3 p-3">
            <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <h4 className="font-semibold text-slate-200">Home Scan & Clean Routes</h4>
              <p className="text-slate-400 text-[11px] mt-0.5">
                AI camera audit for indoor hotspots and lowest pollution travel modes.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Action CTA */}
      <div className="space-y-3 pt-6">
        <button
          type="button"
          onClick={handleCompleteOnboarding}
          className="w-full py-3.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/25 active:scale-[0.99]"
        >
          <span>{t('onboarding.demoContinue', "View Today's Air Plan")}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-[10px] text-center text-slate-500">
          You can customize family members and home parameters anytime.
        </p>
      </div>
    </div>
  );
};

export default OnboardingPage;
