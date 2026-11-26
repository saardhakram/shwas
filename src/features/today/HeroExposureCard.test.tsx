// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import '../../lib/i18n';
import { HeroExposureCard } from './HeroExposureCard';

describe('HeroExposureCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('displays the unified base cigarette number, plan pill, and savings badge consistently', () => {
    render(
      <HeroExposureCard
        selectedFamilyId="all"
        animatedExposure={2.8}
        baseCigarettes={2.8}
        targetCigarettes={0.9}
        totalPotentialSavings={1.9}
        locationName="Delhi NCR"
        aqi={214}
      />,
    );

    expect(screen.getAllByText('2.8')).toHaveLength(2);
    expect(screen.getByText('0.9')).toBeTruthy();
    expect(screen.getByText(/-1\.9/)).toBeTruthy();
    expect(screen.getByText(/Delhi NCR AQI:/)).toBeTruthy();
  });

  it('has zero axe accessibility violations', async () => {
    const { container } = render(
      <HeroExposureCard
        selectedFamilyId="all"
        animatedExposure={3.4}
        baseCigarettes={3.4}
        targetCigarettes={1.2}
        totalPotentialSavings={2.2}
        locationName="Delhi NCR"
        aqi={245}
      />,
    );
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
