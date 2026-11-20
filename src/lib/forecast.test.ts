import { describe, it, expect } from 'vitest';
import {
  computeBestWindow,
  getOfflineFallbackForecast,
  ForecastDataPoint,
} from './forecast';

describe('Open-Meteo & Best Air Window Engine', () => {
  it('marks offline fallback forecast clearly as sample data', () => {
    const fallback = getOfflineFallbackForecast();
    expect(fallback.isSampleData).toBe(true);
    expect(fallback.sourceLabel).toContain('Sample data');
    expect(fallback.points.length).toBeGreaterThanOrEqual(24);
  });

  it('never suggests a window that has already passed when evaluated at night (e.g. 10 PM)', () => {
    // Construct a 48h dataset starting today at 00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const points: ForecastDataPoint[] = [];
    for (let i = 0; i < 48; i++) {
      const ptDate = new Date(today.getTime() + i * 3600 * 1000);
      const hour = ptDate.getHours();
      const isTomorrow = i >= 24;

      // Make 2 PM today very low (e.g. 50 µg/m³) to test that it is NOT chosen if evaluated at 10 PM
      let pm25 = 200;
      if (!isTomorrow && (hour === 14 || hour === 15)) pm25 = 40; // Past 2 PM today
      if (isTomorrow && (hour === 14 || hour === 15)) pm25 = 60;  // Upcoming 2 PM tomorrow

      points.push({
        isoTime: ptDate.toISOString(),
        timestamp: ptDate.getTime(),
        time: `${hour}:00`,
        fullTime: `${hour}:00`,
        hour,
        day: isTomorrow ? 'Tomorrow' : 'Today',
        pm25,
        usAqi: Math.round(pm25 * 1.2), // Mock US AQI
        aqi: Math.round(pm25 * 1.2),
        isPast: false,
      });
    }

    // Reference time: 10:00 PM (22:00) today
    const referenceNight = new Date(today.getTime() + 22 * 3600 * 1000);

    const bestWindow = computeBestWindow(points, referenceNight);

    // The chosen window MUST be in the future (timestamp >= 22:00 today)
    // It must NOT pick 2:00 PM today because that has already passed!
    expect(bestWindow.dayLabel).toBe('Tomorrow');
    expect(bestWindow.label).toContain('Tomorrow');
    expect(bestWindow.startHour).toBe(14); // picked tomorrow's 2 PM
  });

  it('suggests daytime window today when evaluated in the morning (e.g. 9 AM)', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const points: ForecastDataPoint[] = [];
    for (let i = 0; i < 48; i++) {
      const ptDate = new Date(today.getTime() + i * 3600 * 1000);
      const hour = ptDate.getHours();
      const isTomorrow = i >= 24;

      // 2 PM today is best
      let pm25 = 200;
      if (!isTomorrow && (hour === 14 || hour === 15)) pm25 = 55;

      points.push({
        isoTime: ptDate.toISOString(),
        timestamp: ptDate.getTime(),
        time: `${hour}:00`,
        fullTime: `${hour}:00`,
        hour,
        day: isTomorrow ? 'Tomorrow' : 'Today',
        pm25,
        usAqi: 150,
        aqi: 150,
        isPast: false,
      });
    }

    // Reference time: 9:00 AM today
    const referenceMorning = new Date(today.getTime() + 9 * 3600 * 1000);
    const bestWindow = computeBestWindow(points, referenceMorning);

    // Should pick today's 2 PM window
    expect(bestWindow.startHour).toBe(14);
    expect(bestWindow.avgPm25).toBe(55);
  });
});
