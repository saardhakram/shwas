// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import i18n from '../../lib/i18n';
import { getOfflineFallbackForecast, type ForecastResult } from '../../lib/forecast';
import { useAskShwas } from './useAskShwas';

const mockFetchSmartForecast = vi.fn();

vi.mock('../../lib/forecast', async () => {
  const actual = await vi.importActual<typeof import('../../lib/forecast')>('../../lib/forecast');
  return {
    ...actual,
    fetchSmartForecast: (...args: unknown[]) => mockFetchSmartForecast(...args),
  };
});

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAskShwas hook', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    mockFetchSmartForecast.mockReset();
  });

  afterEach(async () => {
    cleanup();
    global.fetch = originalFetch;
    await i18n.changeLanguage('en');
  });

  it('sends question, appends assistant reply with mini-card, and updates welcome on language switch', async () => {
    const forecastDeferred = createDeferred<ForecastResult>();
    mockFetchSmartForecast.mockReturnValue(forecastDeferred.promise);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answer: 'Better to walk at 2 PM when PM2.5 drops.',
        remainingToday: 18,
        source: 'gemini',
        miniCard: {
          timeLabel: '6:00 PM',
          aqi: 310,
          pm25: 260,
          cigarettes: 0.5,
          durationHours: 1,
          level: 'high',
        },
      }),
    });

    const { result } = renderHook(() => useAskShwas());

    await act(async () => {
      forecastDeferred.resolve(getOfflineFallbackForecast());
      await Promise.resolve();
    });

    expect(mockFetchSmartForecast).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.sendQuestion('Can Dadi walk at 6 PM?');
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2].text).toContain('2 PM');
    expect(result.current.messages[2].miniCard?.aqi).toBe(310);
    expect(result.current.remainingToday).toBe(18);
    expect(result.current.isSending).toBe(false);

    await act(async () => {
      await i18n.changeLanguage('hi');
    });
    expect(result.current.messages[0].text).not.toBe('');
  });

  it('returns friendly offline fallback reply when /api/ask fails', async () => {
    const forecastDeferred = createDeferred<ForecastResult>();
    mockFetchSmartForecast.mockReturnValue(forecastDeferred.promise);
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useAskShwas());

    await act(async () => {
      forecastDeferred.resolve(getOfflineFallbackForecast());
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendQuestion('Best mask for school?');
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2].source).toBe('offline');
    expect(result.current.isSending).toBe(false);
  });
});
