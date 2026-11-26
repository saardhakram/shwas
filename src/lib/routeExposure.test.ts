import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MODE_EXPOSURE_FACTORS,
  CO2_KG_PER_KM,
  sampleRoutePoints,
  buildOpenMeteoBatchUrl,
  fetchRoutePointsPm25,
  calculateRouteCigarettes,
  calculateRouteCo2Kg,
  estimateMetroRoute,
  selectRecommendedOption,
  evaluateRouteOptions,
  computeDepartureTip,
  LatLon,
  RawRouteGeometry,
} from './routeExposure';
import { ForecastDataPoint } from './forecast';

describe('routeExposure.ts (Clean Routes Exposure & CO2 Engine)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('defines exact documented mode exposure factors and CO2 rates', () => {
    expect(MODE_EXPOSURE_FACTORS).toEqual({
      car: 0.6,
      auto: 1.3,
      two_wheeler: 1.3,
      walk: 1.2,
      metro: 0.5,
    });

    expect(CO2_KG_PER_KM).toEqual({
      car: 0.17,
      auto: 0.08,
      two_wheeler: 0.05,
      metro: 0.03,
      walk: 0,
    });
  });

  it('samples exactly 5 evenly spaced points along a route polyline', () => {
    const path: LatLon[] = [
      { lat: 28.60, lon: 77.20 },
      { lat: 28.62, lon: 77.20 },
      { lat: 28.64, lon: 77.20 },
    ];
    const sampled = sampleRoutePoints(path, 5);
    expect(sampled).toHaveLength(5);
    expect(sampled[0].lat).toBeCloseTo(28.60, 4);
    expect(sampled[2].lat).toBeCloseTo(28.62, 4);
    expect(sampled[4].lat).toBeCloseTo(28.64, 4);
  });

  it('fetches PM2.5 for multiple sampled points in ONE Open-Meteo comma-separated request', async () => {
    const points: LatLon[] = [
      { lat: 28.60, lon: 77.20 },
      { lat: 28.61, lon: 77.21 },
      { lat: 28.62, lon: 77.22 },
    ];

    const url = buildOpenMeteoBatchUrl(points);
    expect(url).toContain('latitude=28.6000,28.6100,28.6200');
    expect(url).toContain('longitude=77.2000,77.2100,77.2200');

    const departure = new Date('2026-11-26T09:00:00');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { hourly: { time: ['2026-11-26T08:00', '2026-11-26T09:00'], pm2_5: [210, 240] } },
        { hourly: { time: ['2026-11-26T08:00', '2026-11-26T09:00'], pm2_5: [190, 260] } },
        { hourly: { time: ['2026-11-26T08:00', '2026-11-26T09:00'], pm2_5: [180, 220] } },
      ],
    });
    global.fetch = mockFetch;

    const pm25s = await fetchRoutePointsPm25(points, departure, 150);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(pm25s).toEqual([240, 260, 220]);
  });

  it('calculates cigarettes = avgPM2.5 * travelHours * modeFactor / 528 accurately', () => {
    // avgPM2.5 = 264, 60 min (1 hour), car factor = 0.6 => 264 * 1 * 0.6 / 528 = 0.30
    expect(calculateRouteCigarettes(264, 60, 'car')).toBe(0.3);
    // auto factor = 1.3 => 264 * 1 * 1.3 / 528 = 0.65
    expect(calculateRouteCigarettes(264, 60, 'auto')).toBe(0.65);
    // metro factor = 0.5 => 264 * 1 * 0.5 / 528 = 0.25
    expect(calculateRouteCigarettes(264, 60, 'metro')).toBe(0.25);
    // walk factor = 1.2 => 264 * 1 * 1.2 / 528 = 0.60
    expect(calculateRouteCigarettes(264, 60, 'walk')).toBe(0.6);
  });

  it('calculates CO2 emissions per km for each mode', () => {
    expect(calculateRouteCo2Kg(10, 'car')).toBe(1.7);
    expect(calculateRouteCo2Kg(10, 'auto')).toBe(0.8);
    expect(calculateRouteCo2Kg(10, 'two_wheeler')).toBe(0.5);
    expect(calculateRouteCo2Kg(10, 'metro')).toBe(0.3);
    expect(calculateRouteCo2Kg(10, 'walk')).toBe(0);
  });

  it('estimates Metro route with walk + 35 km/h rail speed and Google Maps transit URL', () => {
    const origin = { lat: 28.6139, lon: 77.2090 };
    const dest = { lat: 28.5628, lon: 77.1745 };
    const metro = estimateMetroRoute(origin, dest, 10);

    expect(metro.mode).toBe('metro');
    expect(metro.isEstimate).toBe(true);
    expect(metro.durationMin).toBeGreaterThanOrEqual(20); // ~12 min walk + ~16 min rail
    expect(metro.transitUrl).toContain('https://www.google.com/maps/dir/?api=1');
    expect(metro.transitUrl).toContain('travelmode=transit');
    expect(metro.path.length).toBeGreaterThanOrEqual(5);
  });

  it('recommends the lowest-cigarette option within 15 minutes of the fastest option', () => {
    const options = [
      { id: 'two_wheeler', durationMin: 20, cigarettes: 0.9 }, // fastest (20 min)
      { id: 'metro', durationMin: 32, cigarettes: 0.22 }, // +12 min (within 15 min), cleanest!
      { id: 'car', durationMin: 24, cigarettes: 0.35 },
      { id: 'walk', durationMin: 95, cigarettes: 0.15 }, // cleaner, but +75 min (> 15 min)
    ];

    expect(selectRecommendedOption(options)).toBe('metro');
  });

  it('colours routes mint (cleanest) -> amber -> red (dirtiest) and marks recommended', () => {
    const basePath: LatLon[] = [
      { lat: 28.61, lon: 77.20 },
      { lat: 28.64, lon: 77.22 },
    ];
    const routes: RawRouteGeometry[] = [
      { id: 'metro', mode: 'metro', label: 'Metro', distanceKm: 8, durationMin: 26, path: basePath, isEstimate: true },
      { id: 'car', mode: 'car', label: 'Car', distanceKm: 8, durationMin: 24, path: basePath },
      { id: 'auto', mode: 'auto', label: 'Auto', distanceKm: 8, durationMin: 26, path: basePath },
    ];

    const evaluated = evaluateRouteOptions(routes, [240, 240, 240]);
    const metro = evaluated.find((r) => r.id === 'metro')!;
    const car = evaluated.find((r) => r.id === 'car')!;
    const auto = evaluated.find((r) => r.id === 'auto')!;

    expect(metro.recommended).toBe(true);
    expect(metro.strokeColor).toBe('#2DD4BF'); // mint
    expect(car.exposureLevel).toBe('clean');
    expect(auto.strokeColor).toBe('#EF4444'); // red (dirtiest)
  });

  it('computes a departure timing tip from the 48-hour forecast', () => {
    const now = new Date('2026-11-26T09:00:00');
    const mkPoint = (isoTime: string, time: string, fullTime: string, hour: number, pm25: number, usAqi: number): ForecastDataPoint => ({
      isoTime,
      timestamp: new Date(isoTime).getTime(),
      time,
      fullTime,
      hour,
      day: 'Today',
      pm25,
      usAqi,
      aqi: usAqi,
      isPast: false,
    });
    const forecast: ForecastDataPoint[] = [
      mkPoint('2026-11-26T09:00:00', '9 AM', '9:00 AM', 9, 300, 350),
      mkPoint('2026-11-26T11:00:00', '11 AM', '11:00 AM', 11, 250, 300),
      mkPoint('2026-11-26T14:00:00', '2 PM', '2:00 PM', 14, 150, 200),
      mkPoint('2026-11-26T18:00:00', '6 PM', '6:00 PM', 18, 280, 330),
    ];

    const tip = computeDepartureTip(forecast, now, true);
    expect(tip).not.toBeNull();
    expect(tip!.percentLessSmog).toBe(50);
    expect(tip!.message).toContain('2:00 PM');
    expect(tip!.message).toContain('50% less smog');
  });
});
