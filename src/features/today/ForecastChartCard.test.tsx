// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from '../../lib/i18n';
import {
  computeBestWindow,
  computeLocalDayOffset,
  dayKeyFromOffset,
  formatHourFull,
  formatHourShort,
  type ForecastDataPoint,
} from '@shared/forecastWindow';
import { formatStoredTimeText } from '../../lib/dateTimeFormat';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ForecastChartCard } from './ForecastChartCard';

function buildNightForecast(referenceDate: Date): ForecastDataPoint[] {
  const startOfDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0,
  );
  return Array.from({ length: 48 }, (_, i) => {
    const ptDate = new Date(startOfDay.getTime() + i * 3600 * 1000);
    const hour = ptDate.getHours();
    const dayOffset = computeLocalDayOffset(ptDate, referenceDate);
    const isTomorrowAfternoon = dayOffset === 1 && (hour === 14 || hour === 15);
    const pm25 = isTomorrowAfternoon ? 55 : 220;
    return {
      isoTime: ptDate.toISOString(),
      timestamp: ptDate.getTime(),
      time: formatHourShort(hour),
      fullTime: formatHourFull(hour),
      hour,
      day: dayKeyFromOffset(dayOffset),
      dayOffset,
      pm25,
      usAqi: isTomorrowAfternoon ? 145 : 270,
      aqi: isTomorrowAfternoon ? 145 : 270,
      isPast: ptDate.getTime() < referenceDate.getTime(),
    };
  });
}

describe('ForecastChartCard & LanguageSwitcher localisation', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('renders forecast best-window text in Telugu without English Today/Tomorrow', async () => {
    await i18n.changeLanguage('te');

    const referenceNight = new Date(2026, 10, 26, 22, 0, 0, 0);
    const points = buildNightForecast(referenceNight);
    const bestWindow = computeBestWindow(points, referenceNight);

    const { container } = render(
      <ForecastChartCard
        forecastPoints={points}
        bestWindow={bestWindow}
        isMlForecast={true}
        isSampleData={false}
        modelMae={21.4}
        mlGeneratedAt={new Date(referenceNight.getTime() - 2 * 3600 * 1000).toISOString()}
        sourceLabel="Model MAE ±21 µg/m³"
      />,
    );

    const renderedText = container.textContent || '';
    expect(renderedText).toContain('రేపు');
    expect(renderedText).not.toMatch(/\bTomorrow\b/);
    expect(renderedText).not.toMatch(/\bToday\b/);
  });

  it('uses the native language name in the LanguageSwitcher aria-label', async () => {
    await i18n.changeLanguage('te');
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('button', { name: /తెలుగు/ });
    expect(trigger.getAttribute('aria-label')).toContain('తెలుగు');
    expect(trigger.getAttribute('aria-label')).not.toContain('Telugu');
  });

  it('formats stored clock times with Intl.DateTimeFormat for Indian locales', () => {
    expect(formatStoredTimeText('7:30 AM', 'en')).toBe('7:30 AM');
    expect(formatStoredTimeText('2:00 PM', 'mr')).toMatch(/२:००/);
    expect(formatStoredTimeText('2:00 PM', 'bn')).toMatch(/২:০০/);
  });
});
