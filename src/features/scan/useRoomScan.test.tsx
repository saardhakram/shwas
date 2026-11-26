// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import '../../lib/i18n';
import { useRoomScan } from './useRoomScan';
import { STORAGE_KEYS, storage } from '../../lib/storage';

vi.mock('../../lib/imageUtils', () => ({
  resizeImageForUpload: vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc123' }),
}));

describe('useRoomScan hook', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  function makeFileChangeEvent() {
    const file = new File(['photo'], 'kitchen.jpg', { type: 'image/jpeg' });
    return {
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
  }

  it('scans a room photo with Gemini Vision, adds fix to cached plan, and resets cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        source: 'gemini',
        room: 'kitchen',
        sources: [
          {
            id: 'unvented_stove',
            label: 'Unvented Gas Stove',
            box: { x: 0.2, y: 0.3, w: 0.4, h: 0.3 },
          },
        ],
      }),
    });

    const { result } = renderHook(() => useRoomScan());

    await act(async () => {
      await result.current.handleFileChange(makeFileChangeEvent());
    });

    expect(result.current.scanSource).toBe('gemini');
    expect(result.current.detectedRoom).toBe('kitchen');
    expect(result.current.computedFixes).toHaveLength(1);
    expect(result.current.totalSaved).toBeGreaterThan(0);
    expect(result.current.selectedFixId).toBe(result.current.computedFixes[0].id);

    act(() => {
      result.current.handleAddToPlan(result.current.computedFixes[0]);
    });
    expect(result.current.addedFixIds[result.current.computedFixes[0].id]).toBe(true);
    const dateStr = new Date().toISOString().slice(0, 10);
    expect(storage.getItem(STORAGE_KEYS.planCache(`${dateStr}_en_city`))).toBeTruthy();

    act(() => {
      result.current.handleReset();
    });
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.computedFixes).toHaveLength(0);
    expect(result.current.scanSource).toBeNull();
  });

  it('falls back to sample audit when /api/scan responds offline with no sources', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ source: 'offline', room: 'living', sources: [] }),
    });

    const { result } = renderHook(() => useRoomScan());

    await act(async () => {
      await result.current.handleFileChange(makeFileChangeEvent());
    });

    expect(result.current.scanSource).toBe('offline');
    expect(result.current.errorMessage).toContain('Offline mode');
    expect(result.current.computedFixes.length).toBeGreaterThan(0);
  });

  it('sets error message when scan fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network fail'));

    const { result } = renderHook(() => useRoomScan());

    await act(async () => {
      await result.current.handleFileChange(makeFileChangeEvent());
    });

    expect(result.current.scanSource).toBe('offline');
    expect(result.current.errorMessage).toContain('Could not analyze');
  });
});
