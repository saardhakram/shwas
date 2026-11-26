import { describe, it, expect, vi } from 'vitest';
import {
  computeBestWindow,
  getOfflineFallbackForecast,
  resolveMlForecastFromRows,
  fetchSmartForecast,
  ForecastDataPoint,
  SupabaseForecastRow,
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
      if (isTomorrow && (hour === 14 || hour === 15)) pm25 = 60; // Upcoming 2 PM tomorrow

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

  describe('Supabase ML Forecast & Open-Meteo Fallback', () => {
    const makeRows = (
      locationId: string,
      lat: number,
      lon: number,
      generatedAt: Date,
      basePm25 = 160,
      modelMae = 21.4,
    ): SupabaseForecastRow[] => {
      return Array.from({ length: 48 }, (_, i) => {
        const target = new Date(generatedAt.getTime() + (i + 1) * 3600 * 1000);
        return {
          location_id: locationId,
          location_name: locationId === 'delhi_ito' ? 'ITO, Central Delhi' : 'Anand Vihar, Delhi',
          lat,
          lon,
          generated_at: generatedAt.toISOString(),
          target_time: target.toISOString(),
          horizon_hour: i + 1,
          predicted_pm25: basePm25 + (i % 6),
          predicted_us_aqi: 210,
          model_version: 'shwas-lgbm-v1',
          model_mae: modelMae,
        };
      });
    };

    it('uses fresh (< 6h) ML forecast for nearest Delhi station, reports Model MAE and updatedAgoLabel', async () => {
      const now = new Date('2026-11-26T10:00:00Z');
      const freshGen = new Date(now.getTime() - 4 * 3600 * 1000); // 4 hours old (< 6h)
      const rows = [
        ...makeRows('delhi_anand_vihar', 28.6469, 77.316, freshGen, 220, 19.6),
        ...makeRows('delhi_ito', 28.6289, 77.2405, freshGen, 155, 19.6),
      ];

      const fallbackSpy = vi.fn();
      // Query near ITO (28.625, 77.235)
      const res = await fetchSmartForecast(28.625, 77.235, {
        loadSupabaseRows: async () => rows,
        fallbackFetch: fallbackSpy,
        now,
      });

      expect(fallbackSpy).not.toHaveBeenCalled();
      expect(res.isMlForecast).toBe(true);
      expect(res.mlLocationName).toBe('ITO, Central Delhi');
      expect(res.modelMae).toBe(19.6);
      expect(res.sourceLabel).toBe('Model MAE ±20 µg/m³');
      expect(res.generatedAt).toBe(freshGen.toISOString());
      expect(res.updatedAgoLabel).toBe('updated 4 hr ago');
      expect(res.points).toHaveLength(48);
    });

    it('falls back to Open-Meteo when ML forecast is stale (>= 6h old)', async () => {
      const now = new Date('2026-11-26T10:00:00Z');
      const staleGen = new Date(now.getTime() - 7 * 3600 * 1000); // 7 hours old (>= 6h)
      const rows = makeRows('delhi_ito', 28.6289, 77.2405, staleGen);

      const openMeteoResult = {
        ...getOfflineFallbackForecast(),
        isSampleData: false,
        sourceLabel: 'Open-Meteo Live API',
        isMlForecast: false,
      };
      const fallbackSpy = vi.fn().mockResolvedValue(openMeteoResult);

      const res = await fetchSmartForecast(28.6289, 77.2405, {
        loadSupabaseRows: async () => rows,
        fallbackFetch: fallbackSpy,
        now,
      });

      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(res.isMlForecast).toBe(false);
      expect(res.sourceLabel).toBe('Open-Meteo Live API');
    });

    it('falls back to Open-Meteo when user location is outside Delhi (> 60 km away)', () => {
      const now = new Date('2026-11-26T10:00:00Z');
      const freshGen = new Date(now.getTime() - 30 * 60 * 1000);
      const rows = makeRows('delhi_ito', 28.6289, 77.2405, freshGen);

      // Mumbai coordinates (~1,150 km from Delhi)
      const mlRes = resolveMlForecastFromRows(rows, 19.076, 72.8777, now);
      expect(mlRes).toBeNull();
    });

    it('falls back to Open-Meteo when Supabase query errors or returns empty', async () => {
      const fallbackSpy = vi.fn().mockResolvedValue({
        ...getOfflineFallbackForecast(),
        isMlForecast: false,
        sourceLabel: 'Open-Meteo Live API',
      });

      const res = await fetchSmartForecast(28.6289, 77.2405, {
        loadSupabaseRows: async () => {
          throw new Error('Network error');
        },
        fallbackFetch: fallbackSpy,
      });

      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(res.isMlForecast).toBe(false);
    });
  });
});
