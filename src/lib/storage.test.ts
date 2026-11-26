import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS, createStorage, type StorageBackend } from './storage';

function makeMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('storage wrapper', () => {
  it('reads, writes, and removes string and JSON values safely', () => {
    const backend = makeMemoryBackend();
    const store = createStorage(() => backend);

    expect(store.setItem(STORAGE_KEYS.LANGUAGE, 'hi')).toBe(true);
    expect(store.getItem(STORAGE_KEYS.LANGUAGE)).toBe('hi');

    const profile = { language: 'hi', location: { name: 'Delhi NCR', lat: 28.6, lon: 77.2 } };
    expect(store.setJson(STORAGE_KEYS.PROFILE, profile)).toBe(true);
    expect(store.getJson<typeof profile>(STORAGE_KEYS.PROFILE)).toEqual(profile);

    expect(store.removeItem(STORAGE_KEYS.PROFILE)).toBe(true);
    expect(store.getJson(STORAGE_KEYS.PROFILE)).toBeNull();
  });

  it('returns null on corrupted JSON instead of throwing', () => {
    const backend = makeMemoryBackend();
    backend.setItem(STORAGE_KEYS.PROFILE, '{invalid-json');
    const store = createStorage(() => backend);

    expect(store.getJson(STORAGE_KEYS.PROFILE)).toBeNull();
  });

  it('catches SecurityError / QuotaExceededError when backend throws (private mode)', () => {
    const throwingBackend: StorageBackend = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError: storage disabled');
      }),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError: storage full');
      }),
      removeItem: vi.fn(() => {
        throw new Error('SecurityError: storage disabled');
      }),
    };
    const store = createStorage(() => throwingBackend);

    expect(store.getItem(STORAGE_KEYS.LANGUAGE)).toBeNull();
    expect(store.setItem(STORAGE_KEYS.LANGUAGE, 'en')).toBe(false);
    expect(store.setJson(STORAGE_KEYS.PROFILE, { ok: true })).toBe(false);
    expect(store.removeItem(STORAGE_KEYS.PROFILE)).toBe(false);
  });

  it('handles null backend gracefully (SSR/Node)', () => {
    const store = createStorage(() => null);
    expect(store.getItem(STORAGE_KEYS.LANGUAGE)).toBeNull();
    expect(store.setItem(STORAGE_KEYS.LANGUAGE, 'te')).toBe(false);
    expect(store.removeItem(STORAGE_KEYS.LANGUAGE)).toBe(false);
  });

  it('builds consistent dynamic keys', () => {
    expect(STORAGE_KEYS.planCache('2026-11-26_en_Delhi')).toBe('shwas_plan_2026-11-26_en_Delhi');
    expect(STORAGE_KEYS.planCompleted('2026-11-26')).toBe('shwas_plan_completed_2026-11-26');
  });
});
