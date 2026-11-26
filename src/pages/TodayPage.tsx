import React from 'react';
import { useTodayPlan } from '../features/today/useTodayPlan';
import { HeroExposureCard } from '../features/today/HeroExposureCard';
import { ForecastChartCard } from '../features/today/ForecastChartCard';
import { PlanTimeline } from '../features/today/PlanTimeline';

export const TodayPage: React.FC = () => {
  const {
    aqi,
    selectedFamilyId,
    locationName,
    forecastPoints,
    isSampleData,
    isMlForecast,
    modelMae,
    mlGeneratedAt,
    sourceLabel,
    bestWindow,
    planSource,
    isPlanLoading,
    isStillThinking,
    exposureSummary,
    animatedExposure,
    togglePlanItem,
  } = useTodayPlan();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <HeroExposureCard
        selectedFamilyId={selectedFamilyId}
        animatedExposure={animatedExposure}
        baseCigarettes={exposureSummary.heroCigarettes}
        targetCigarettes={exposureSummary.targetCigarettes}
        totalPotentialSavings={exposureSummary.totalPotentialSavings}
        locationName={locationName}
        aqi={aqi}
      />

      <ForecastChartCard
        forecastPoints={forecastPoints}
        bestWindow={bestWindow}
        isMlForecast={isMlForecast}
        isSampleData={isSampleData}
        modelMae={modelMae}
        mlGeneratedAt={mlGeneratedAt}
        sourceLabel={sourceLabel}
      />

      <PlanTimeline
        planItems={exposureSummary.planItems}
        isPlanLoading={isPlanLoading}
        isStillThinking={isStillThinking}
        planSource={planSource}
        checkedSavings={exposureSummary.checkedSavings}
        totalPotentialSavings={exposureSummary.totalPotentialSavings}
        onToggleItem={togglePlanItem}
      />
    </div>
  );
};

export default TodayPage;
