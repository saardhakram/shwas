// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../lib/i18n';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import { useOnboarding } from './useOnboarding';

const mockNavigate = vi.fn();
const mockUpsertProfile = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
  };
});

vi.mock('../../lib/forecast', async () => {
  const actual = await vi.importActual<typeof import('../../lib/forecast')>('../../lib/forecast');
  return {
    ...actual,
    fetchOpenMeteoForecast: vi.fn().mockResolvedValue({
      ...actual.getOfflineFallbackForecast(),
      currentPm25: 190,
      currentAqi: 240,
      isSampleData: false,
    }),
  };
});

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('useOnboarding hook family', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    mockUpsertProfile.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    cleanup();
    global.fetch = originalFetch;
    await i18n.changeLanguage('en');
  });

  it('handles language switch, family editing, city search, reveal calculation, and completion', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('nominatim.openstreetmap.org')) {
        return {
          ok: true,
          json: async () => [
            { display_name: 'Pune, Maharashtra, India', lat: '18.52', lon: '73.85' },
          ],
        };
      }
      return {
        ok: true,
        json: async () => ({ current: { pm2_5: 190 } }),
      };
    });

    const { result } = renderHook(() => useOnboarding(), { wrapper });

    // Step 1: Select language
    act(() => {
      result.current.handleSelectLanguage('hi');
    });
    expect(result.current.language).toBe('hi');
    expect(storage.getItem(STORAGE_KEYS.LANGUAGE)).toBe('hi');

    // Step 2: Search city
    act(() => {
      result.current.setSearchQuery('Pune');
    });
    await act(async () => {
      await result.current.handleSearchCity({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.searchResults[0]?.name).toContain('Pune');

    // Step 3: Add & remove family member + update routine
    const initialCount = result.current.family.length;
    act(() => {
      result.current.setNewMemberName('Dadi');
      result.current.setNewMemberAge(72);
      result.current.setNewMemberFlags({ heart: true });
    });
    act(() => {
      result.current.handleAddMember();
    });
    expect(result.current.family.length).toBe(initialCount + 1);

    act(() => {
      result.current.updateMemberRoutine(0, 'hoursOutside', 3);
    });
    expect(result.current.family[0].routine.hoursOutside).toBe(3);

    const addedId = result.current.family[result.current.family.length - 1].id;
    act(() => {
      result.current.handleRemoveMember(addedId);
    });
    expect(result.current.family.length).toBe(initialCount);

    // Step 5: Reveal calculation (includes 600ms reveal delay)
    vi.useFakeTimers();
    try {
      await act(async () => {
        result.current.setStep(5);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(result.current.isCalculating).toBe(false);
    expect(result.current.outdoorPm25).toBe(190);
    expect(result.current.revealedCigarettes).toBeGreaterThan(0);

    // Complete onboarding
    await act(async () => {
      await result.current.handleComplete();
    });
    expect(mockUpsertProfile).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/today');
  });
});
