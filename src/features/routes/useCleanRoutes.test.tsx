// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import i18n from '../../lib/i18n';
import { buildDepartureDate, parseTipTimeTo24h, useCleanRoutes } from './useCleanRoutes';
import type { ForecastDataPoint } from '../../lib/forecast';
import type { RawRouteGeometry } from '../../lib/routeExposure';

const mockFetchOpenMeteo = vi.fn();
const mockFetchRoutesForTrip = vi.fn();
const mockFetchRoutePointsPm25 = vi.fn();
const mockSearchPlaces = vi.fn();

vi.mock('../../lib/forecast', async () => {
  const actual = await vi.importActual<typeof import('../../lib/forecast')>('../../lib/forecast');
  return {
    ...actual,
    fetchOpenMeteoForecast: (...args: unknown[]) => mockFetchOpenMeteo(...args),
  };
});

vi.mock('../../lib/routingService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/routingService')>(
    '../../lib/routingService',
  );
  return {
    ...actual,
    fetchRoutesForTrip: (...args: unknown[]) => mockFetchRoutesForTrip(...args),
    searchPlaces: (...args: unknown[]) => mockSearchPlaces(...args),
  };
});

vi.mock('../../lib/routeExposure', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/routeExposure')>('../../lib/routeExposure');
  return {
    ...actual,
    fetchRoutePointsPm25: (...args: unknown[]) => mockFetchRoutePointsPm25(...args),
  };
});

function buildTipForecast(base: Date): ForecastDataPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const dt = new Date(base.getTime() + i * 3600 * 1000);
    const pm25 = i === 4 ? 100 : 280;
    return {
      isoTime: dt.toISOString(),
      timestamp: dt.getTime(),
      time: `${dt.getHours()}:00`,
      fullTime: `${dt.getHours()}:00`,
      hour: dt.getHours(),
      day: 'time.today',
      dayOffset: 0,
      pm25,
      usAqi: pm25,
      aqi: pm25,
      isPast: false,
    };
  });
}

describe('useCleanRoutes & routeTimeHelpers', () => {
  beforeEach(() => {
    localStorage.clear();
    const now = new Date();
    mockFetchOpenMeteo.mockReset().mockResolvedValue({
      currentAqi: 280,
      currentPm25: 280,
      points: buildTipForecast(now),
      isSampleData: false,
      sourceLabel: 'Open-Meteo Live API',
    });

    const sampleRoutes: RawRouteGeometry[] = [
      {
        id: 'metro',
        mode: 'metro',
        label: 'Metro',
        distanceKm: 8,
        durationMin: 24,
        path: [
          { lat: 28.61, lon: 77.2 },
          { lat: 28.64, lon: 77.22 },
        ],
        isEstimate: true,
      },
      {
        id: 'car',
        mode: 'car',
        label: 'Car',
        distanceKm: 8,
        durationMin: 22,
        path: [
          { lat: 28.61, lon: 77.2 },
          { lat: 28.64, lon: 77.22 },
        ],
      },
    ];
    mockFetchRoutesForTrip.mockReset().mockResolvedValue({
      routes: sampleRoutes,
      provider: 'osrm',
    });
    mockFetchRoutePointsPm25.mockReset().mockResolvedValue(Array(10).fill(220));
    mockSearchPlaces
      .mockReset()
      .mockResolvedValue([{ name: 'Connaught Place', lat: 28.6315, lon: 77.2167 }]);
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('builds departure dates and parses 12h labels into 24h strings', () => {
    const ref = new Date(2026, 10, 26, 10, 0, 0, 0);
    expect(buildDepartureDate('now', '14:30', ref)).toBe(ref);
    expect(buildDepartureDate('plus1h', '14:30', ref).getHours()).toBe(11);
    expect(buildDepartureDate('custom', '15:45', ref).getHours()).toBe(15);
    expect(buildDepartureDate('custom', '08:00', ref).getDate()).toBe(27);

    expect(parseTipTimeTo24h('2:30 PM')).toBe('14:30');
    expect(parseTipTimeTo24h('12:00 AM')).toBe('00:00');
    expect(parseTipTimeTo24h('invalid')).toBeNull();
  });

  it('evaluates routes when provider becomes ready, applies departure tip, and handles errors', async () => {
    let resolveForecast!: (val: unknown) => void;
    const forecastPromise = new Promise((r) => {
      resolveForecast = r;
    });
    mockFetchOpenMeteo.mockReturnValueOnce(forecastPromise);

    const { result } = renderHook(() => useCleanRoutes());

    await act(async () => {
      resolveForecast({
        currentAqi: 280,
        currentPm25: 280,
        points: buildTipForecast(new Date()),
        isSampleData: false,
        sourceLabel: 'Open-Meteo Live API',
      });
      await Promise.resolve();
    });

    expect(result.current.departureTip).not.toBeNull();

    await act(async () => {
      result.current.handleMapProviderChange('leaflet');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.evaluatedRoutes.length).toBe(2);
    expect(result.current.isLoadingRoutes).toBe(false);
    expect(result.current.routingProvider).toBe('osrm');
    expect(result.current.selectedRouteId).toBe('metro');

    await act(async () => {
      result.current.handleApplyTipTime();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.departurePreset).toBe('custom');

    await act(async () => {
      result.current.handleChipClick('school');
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.destination?.name).toBe(result.current.quickPresets.school.name);

    mockFetchRoutesForTrip.mockRejectedValueOnce(new Error('OSRM offline'));
    await act(async () => {
      result.current.setDeparturePreset('plus1h');
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.routeError).toBeTruthy();
  });
});
