import { describe, it, expect } from 'vitest';
import { generate48HourForecast, computeBestWindow } from './forecast';

describe('48-Hour Forecast & Best Air Window Engine', () => {
  it('generates exactly 48 hourly points with valid PM2.5 levels', () => {
    const forecast = generate48HourForecast();
    expect(forecast).toHaveLength(48);

    const firstPoint = forecast[0];
    expect(firstPoint).toHaveProperty('hourIndex', 0);
    expect(firstPoint).toHaveProperty('day', 'Today');
    expect(firstPoint.pm25).toBeGreaterThan(0);

    const tomorrowPoint = forecast[24];
    expect(tomorrowPoint).toHaveProperty('day', 'Tomorrow');
  });

  it('computes a consistent daytime best clean-air window', () => {
    const forecast = generate48HourForecast();
    const bestWindow = computeBestWindow(forecast);

    expect(bestWindow).toBeDefined();
    expect(bestWindow.startHour).toBeGreaterThanOrEqual(11);
    expect(bestWindow.endHour).toBeLessThanOrEqual(19);
    expect(bestWindow.label).toContain('–');
    expect(bestWindow.avgPm25).toBeLessThan(200); // midday dispersion drops PM2.5
    expect(bestWindow.chartStart).toBeDefined();
    expect(bestWindow.chartEnd).toBeDefined();
  });
});
