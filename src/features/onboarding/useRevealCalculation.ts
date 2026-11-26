import { useEffect, useState } from 'react';
import { calculateFamilyExposure } from '../../lib/cigarettes';
import { fetchOpenMeteoForecast } from '../../lib/forecast';
import { buildEnrichedPlan, generateRuleBasedPlan } from '../../lib/planGenerator';
import type { ProfileFamilyMember, ProfileHome, ProfileLocation, UserProfile } from '../../types';

export function useRevealCalculation(
  step: number,
  language: string,
  location: ProfileLocation,
  family: ProfileFamilyMember[],
  home: ProfileHome,
) {
  const runKey = `${language}|${location.lat}|${location.lon}|${family.length}|${home.purifier}|${home.chimney}|${home.windowsFacingRoad}|${home.cookingFuel}`;
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const [outdoorPm25, setOutdoorPm25] = useState<number>(240);
  const [revealedCigarettes, setRevealedCigarettes] = useState<number>(9);
  const [targetCigarettes, setTargetCigarettes] = useState<number>(5);

  useEffect(() => {
    if (step !== 5) return;
    let active = true;

    fetchOpenMeteoForecast(location.lat, location.lon)
      .then((res) => {
        if (!active) return;
        const livePm25 = res.currentPm25 || 240;
        setOutdoorPm25(livePm25);

        const { perPersonAverage } = calculateFamilyExposure(family, livePm25, home, 'all');
        const previewProfile: UserProfile = { language, location, family, home };
        const previewPlan = buildEnrichedPlan(
          generateRuleBasedPlan(previewProfile, res.points),
          {},
          perPersonAverage,
        );
        const cappedSavings = Number(
          previewPlan.reduce((sum, item) => sum + item.cigarettesSaved, 0).toFixed(1),
        );
        const targetHero = Number(
          Math.max(0, Math.min(perPersonAverage, perPersonAverage - cappedSavings)).toFixed(1),
        );

        setRevealedCigarettes(perPersonAverage);
        setTargetCigarettes(targetHero);
      })
      .finally(() => {
        setTimeout(() => {
          if (active) setCompletedKey(runKey);
        }, 600);
      });

    return () => {
      active = false;
    };
  }, [step, runKey, language, location, home, family]);

  const isCalculating = step === 5 && completedKey !== runKey;
  return { isCalculating, outdoorPm25, revealedCigarettes, targetCigarettes };
}
