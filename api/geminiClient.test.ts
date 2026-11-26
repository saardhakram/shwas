import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callGeminiWithRetry } from './geminiClient';

describe('api/geminiClient.ts (Gemini resilient retry & fallback)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('succeeds immediately on 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"status":"ok"}' }] } }],
      }),
    });

    const result = await callGeminiWithRetry({
      apiKey: 'test-key',
      prompt: 'test prompt',
      primaryModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.1-flash-lite',
    });

    expect(result.text).toBe('{"status":"ok"}');
    expect(result.modelUsed).toBe('gemini-3.8-flash');
    expect(result.attempts).toBe(1);
  });

  it('on 429 quota exhaustion: does NOT retry primary model, jumps straight to fallback model', async () => {
    let callCount = 0;
    const requestedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      requestedUrls.push(url);

      if (callCount === 1) {
        // First call to primary model returns 429 Too Many Requests
        return {
          ok: false,
          status: 429,
          text: async () => 'Resource exhausted (quota limit)',
        };
      }

      // Second call is immediately the fallback model
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"fallback":"429_success"}' }] } }],
        }),
      };
    });

    const result = await callGeminiWithRetry({
      apiKey: 'test-key',
      prompt: 'test prompt',
      primaryModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.1-flash-lite',
    });

    expect(callCount).toBe(2); // Exactly 1 on primary, then 1 on fallback
    expect(requestedUrls[0]).toContain('gemini-3.8-flash');
    expect(requestedUrls[1]).toContain('gemini-3.1-flash-lite');
    expect(result.modelUsed).toBe('gemini-3.1-flash-lite');
    expect(result.text).toBe('{"fallback":"429_success"}');
  });

  it('on 503 service overloaded: retries once after 2s on primary, then switches to fallback model', async () => {
    let callCount = 0;
    const requestedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      requestedUrls.push(url);

      if (callCount <= 2) {
        // Attempts 1 and 2 (initial + retry) return 503
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable / Overloaded',
        };
      }

      // Attempt 3: fallback model succeeds
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"fallback":"503_success"}' }] } }],
        }),
      };
    });

    const result = await callGeminiWithRetry({
      apiKey: 'test-key',
      prompt: 'test prompt',
      primaryModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.1-flash-lite',
    });

    expect(callCount).toBe(3); // 2 on primary + 1 on fallback
    expect(requestedUrls[0]).toContain('gemini-3.8-flash');
    expect(requestedUrls[1]).toContain('gemini-3.8-flash');
    expect(requestedUrls[2]).toContain('gemini-3.1-flash-lite');
    expect(result.modelUsed).toBe('gemini-3.1-flash-lite');
    expect(result.text).toBe('{"fallback":"503_success"}');
  }, 10000);

  it('throws error when total calls reach max 3 without success', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 503,
        text: async () => 'Service Overloaded',
      };
    });

    await expect(
      callGeminiWithRetry({
        apiKey: 'test-key',
        prompt: 'test',
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.1-flash-lite',
      })
    ).rejects.toThrow('All Gemini attempts failed');

    expect(callCount).toBe(3); // 2 on primary + 1 on fallback = max 3 calls
  }, 10000);
});
