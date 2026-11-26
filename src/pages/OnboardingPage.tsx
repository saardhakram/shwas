import React from 'react';
import { ArrowLeft, ArrowRight, Wind } from 'lucide-react';
import { useOnboarding } from '../features/onboarding/useOnboarding';
import { LanguageStep } from '../features/onboarding/LanguageStep';
import { LocationStep } from '../features/onboarding/LocationStep';
import { FamilyStep } from '../features/onboarding/FamilyStep';
import { HomeStep } from '../features/onboarding/HomeStep';
import { RevealStep } from '../features/onboarding/RevealStep';

export const OnboardingPage: React.FC = () => {
  const ob = useOnboarding();

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-5 flex flex-col justify-between selection:bg-teal-500/30 selection:text-teal-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300">
              <Wind className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <span className="font-display font-bold text-base text-white">Shwas</span>
              <span className="text-xs text-teal-400 ml-1" aria-hidden="true">
                श्वास
              </span>
            </div>
          </div>

          {ob.step > 1 && ob.step < 5 && (
            <button
              type="button"
              onClick={() => ob.setStep(ob.step - 1)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5 px-1 py-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                  s === ob.step
                    ? 'bg-teal-400 shadow-[0_0_10px_#2DD4BF]'
                    : s < ob.step
                      ? 'bg-teal-500/60'
                      : 'bg-white/10'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 my-4">
        {ob.step === 1 && (
          <LanguageStep language={ob.language} onSelectLanguage={ob.handleSelectLanguage} />
        )}

        {ob.step === 2 && (
          <LocationStep
            location={ob.location}
            searchQuery={ob.searchQuery}
            searchResults={ob.searchResults}
            isSearching={ob.isSearching}
            isLocating={ob.isLocating}
            onLocationChange={ob.setLocation}
            onSearchQueryChange={ob.setSearchQuery}
            onClearSearchResults={() => ob.setSearchResults([])}
            onUseMyLocation={ob.handleUseMyLocation}
            onSearchCity={ob.handleSearchCity}
          />
        )}

        {ob.step === 3 && (
          <FamilyStep
            family={ob.family}
            newMemberName={ob.newMemberName}
            newMemberAge={ob.newMemberAge}
            newMemberFlags={ob.newMemberFlags}
            onNewMemberNameChange={ob.setNewMemberName}
            onNewMemberAgeChange={ob.setNewMemberAge}
            onNewMemberFlagsChange={ob.setNewMemberFlags}
            onAddMember={ob.handleAddMember}
            onRemoveMember={ob.handleRemoveMember}
          />
        )}

        {ob.step === 4 && (
          <HomeStep
            home={ob.home}
            family={ob.family}
            selectedMemberIdx={ob.selectedMemberIdx}
            onHomeChange={ob.setHome}
            onSelectMemberIdx={ob.setSelectedMemberIdx}
            onUpdateMemberRoutine={ob.updateMemberRoutine}
          />
        )}

        {ob.step === 5 && (
          <RevealStep
            isCalculating={ob.isCalculating}
            location={ob.location}
            outdoorPm25={ob.outdoorPm25}
            revealedCigarettes={ob.revealedCigarettes}
            targetCigarettes={ob.targetCigarettes}
            family={ob.family}
            home={ob.home}
          />
        )}
      </div>

      <div className="pt-2">
        {ob.step < 5 ? (
          <button
            type="button"
            onClick={() => ob.setStep(ob.step + 1)}
            className="w-full py-3.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/25 active:scale-[0.99]"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          !ob.isCalculating && (
            <button
              type="button"
              onClick={ob.handleComplete}
              className="w-full py-3.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/25 active:scale-[0.99]"
            >
              <span>See My Plan</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
