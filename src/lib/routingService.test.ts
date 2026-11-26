import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchRoutesForTrip } from './routingService';
import type { GoogleNamespace, GoogleRoutesComputeRequest } from '../types/maps';

interface TestWindowHolder {
  window?: { google?: GoogleNamespace };
}

describe('routingService.ts (Google Routes -> OSRM)', () => {
  const originalFetch = global.fetch;
  const globalHolder = globalThis as unknown as TestWindowHolder;
  const originalWindow = globalHolder.window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalHolder.window;
    } else {
      globalHolder.window = originalWindow;
    }
  });

  it('calls google.maps.routes.Route.computeRoutes with valid fields (path, distanceMeters, durationMillis) and no polyline field', async () => {
    const capturedRequests: GoogleRoutesComputeRequest[] = [];
    const directionsSpy = vi.fn();

    globalHolder.window = {
      google: {
        maps: {
          DirectionsService: directionsSpy,
          importLibrary: vi.fn().mockResolvedValue({
            Route: {
              computeRoutes: vi.fn().mockImplementation(async (req: GoogleRoutesComputeRequest) => {
                capturedRequests.push(req);
                return {
                  routes: [
                    {
                      distanceMeters: 8400,
                      durationMillis: 1200000,
                      path: [
                        { lat: () => 28.6139, lng: () => 77.209 },
                        { lat: () => 28.622, lng: () => 77.213 },
                        { lat: () => 28.6315, lng: () => 77.2167 },
                      ],
                    },
                  ],
                };
              }),
            },
          }),
        },
      },
    };

    const res = await fetchRoutesForTrip(
      { lat: 28.6139, lon: 77.209 },
      { lat: 28.6315, lon: 77.2167 },
      new Date(),
      true,
    );

    expect(res.provider).toBe('google_routes');
    expect(directionsSpy).not.toHaveBeenCalled();
    expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
    for (const req of capturedRequests) {
      expect(req.fields).toEqual(['path', 'distanceMeters', 'durationMillis']);
      expect(req.fields).not.toContain('polyline');
    }
    const car = res.routes.find((r) => r.mode === 'car');
    expect(car).toBeDefined();
    expect(car!.path).toHaveLength(3);
    expect(car!.distanceKm).toBe(8.4);
    expect(car!.durationMin).toBe(20);
  });

  it('logs at most one warning on Google Routes failure and falls back directly to OSRM (no DirectionsService)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const directionsSpy = vi.fn();

    globalHolder.window = {
      google: {
        maps: {
          DirectionsService: directionsSpy,
          importLibrary: vi.fn().mockResolvedValue({
            Route: {
              computeRoutes: vi.fn().mockRejectedValue(new Error('Quota exceeded')),
            },
          }),
        },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 7500,
            duration: 900,
            geometry: {
              coordinates: [
                [77.209, 28.6139],
                [77.2167, 28.6315],
              ],
            },
            legs: [{ summary: 'Janpath Rd' }],
          },
        ],
      }),
    });

    const res = await fetchRoutesForTrip(
      { lat: 28.6139, lon: 77.209 },
      { lat: 28.6315, lon: 77.2167 },
      new Date(),
      true,
    );

    expect(res.provider).toBe('osrm');
    expect(directionsSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
