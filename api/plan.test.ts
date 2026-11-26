import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processPlanRequest, clearPlanCacheForTesting } from './plan.js';
import type { UserProfile } from '../src/types/index.js';

describe('Serverless Plan API (/api/plan)', () => {
  const profile: UserProfile = {
    id: 'test-user',
    language: 'en',
    location: { lat: 28.6139, lon: 77.2090, name: 'Delhi NCR' },
    family: [
      {
        id: 'me',
        name: 'Me',
        age: 32,
        flags: {},
        routine: { hoursOutside: 2, hoursAway: 8, awayPlace: 'office' },
      },
    ],
    home: {
      windowsFacingRoad: true,
      purifier: true,
      chimney: true,
      cookingFuel: 'lpg',
      commuteMode: 'metro',
    },
  };

  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    clearPlanCacheForTesting();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns valid rule-based plan when no API key is provided', async () => {
    const res = await processPlanRequest({ profile }, undefined);
    expect(res).toBeDefined();
    expect(res.source).toBe('rule_based_no_key');
    expect(res.plan.length).toBeGreaterThanOrEqual(6);
    expect(res.plan[0]).toHaveProperty('time');
    expect(res.plan[0]).toHaveProperty('action');
    expect(res.plan[0]).toHaveProperty('before_pm25');
  });

  it('sends x-goog-api-key header and uses gemini-3.5-flash by default without key in URL', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    let capturedBody: any = {};

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      {
                        time: '7:30 AM',
                        action: 'Keep windows shut',
                        reason: 'High morning traffic',
                        category: 'seal',
                        before_pm25: 280,
                        after_pm25: 140,
                      },
                      {
                        time: '8:30 AM',
                        action: 'Take metro',
                        reason: 'Clean transit',
                        category: 'commute',
                        before_pm25: 250,
                        after_pm25: 80,
                      },
                      {
                        time: '1:00 PM',
                        action: 'Run kitchen chimney',
                        reason: 'Clear cooking smoke',
                        category: 'routine',
                        before_pm25: 160,
                        after_pm25: 70,
                      },
                      {
                        time: '2:30 PM',
                        action: 'Air out rooms',
                        reason: 'Lowest PM2.5 window',
                        category: 'ventilate',
                        before_pm25: 140,
                        after_pm25: 90,
                      },
                      {
                        time: '6:00 PM',
                        action: 'Close balcony doors',
                        reason: 'Evening rush',
                        category: 'seal',
                        before_pm25: 260,
                        after_pm25: 130,
                      },
                      {
                        time: '10:00 PM',
                        action: 'Turn on bedroom air purifier',
                        reason: 'Clean sleep air',
                        category: 'purify',
                        before_pm25: 180,
                        after_pm25: 50,
                      },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const res = await processPlanRequest({ profile }, 'test_api_key');

    // 1. Model in URL should be gemini-3.5-flash
    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'
    );
    // 2. Key must not be in URL
    expect(capturedUrl).not.toContain('key=');
    // 3. Key must be sent in x-goog-api-key header
    expect(capturedHeaders['x-goog-api-key']).toBe('test_api_key');
    // 4. Fast Gemini 3.x settings (thinkingLevel minimal + maxOutputTokens 900 + JSON)
    expect(capturedBody.generationConfig?.responseMimeType).toBe('application/json');
    expect(capturedBody.generationConfig?.maxOutputTokens).toBe(900);
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });

    // 5. Successful response parses plan
    expect(res.source).toBe('gemini');
    expect(res.plan).toHaveLength(6);
    expect(res.plan[0].action).toBe('Keep windows shut');
  });

  it('respects GEMINI_MODEL environment variable when set', async () => {
    process.env.GEMINI_MODEL = 'gemini-custom-model';
    let capturedUrl = '';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { time: '1', action: 'a', reason: 'r', category: 's', before_pm25: 200, after_pm25: 100 },
                      { time: '2', action: 'a', reason: 'r', category: 's', before_pm25: 200, after_pm25: 100 },
                      { time: '3', action: 'a', reason: 'r', category: 's', before_pm25: 200, after_pm25: 100 },
                      { time: '4', action: 'a', reason: 'r', category: 's', before_pm25: 200, after_pm25: 100 },
                      { time: '5', action: 'a', reason: 'r', category: 's', before_pm25: 200, after_pm25: 100 },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    await processPlanRequest({ profile }, 'test_key');
    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-custom-model:generateContent'
    );
  });

  it('logs status and error body on non-200 response and returns fallback plan', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 403,
        text: async () => 'API_KEY_INVALID: User key has expired',
      };
    });

    const res = await processPlanRequest({ profile }, 'bad_key');

    expect(warnSpy).toHaveBeenCalled();
    const loggedMessage = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(loggedMessage).toContain('403');
    expect(loggedMessage).toContain('gemini-3.5-flash');
    expect(res.source).toBe('rule_based_fallback');
    expect(res.plan.length).toBeGreaterThanOrEqual(6);
  });
});
