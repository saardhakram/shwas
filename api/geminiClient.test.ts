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
      fallbackModel: 'gemini-2.5-flash',
    });

    expect(result.text).toBe('{"status":"ok"}');
    expect(result.modelUsed).toBe('gemini-3.8-flash');
    expect(result.attempts).toBe(1);
  });

  it('retries on 503 and switches to fallback model after primary exhausts retries', async () => {
    let callCount = 0;
    const requestedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      requestedUrls.push(url);

      // Attempts 1, 2, 3: primary model fails with 503 Overloaded
      if (callCount <= 3) {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable / Overloaded',
        };
      }

      // Attempt 4: fallback model succeeds
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"fallback":"success"}' }] } }],
        }),
      };
    });

    // Provide small timeoutMs and test with mock backoff
    const result = await callGeminiWithRetry({
      apiKey: 'test-key',
      prompt: 'test prompt',
      primaryModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-2.5-flash',
    });

    expect(callCount).toBe(4); // 3 tries on primary + 1 on fallback
    expect(requestedUrls[0]).toContain('gemini-3.8-flash');
    expect(requestedUrls[1]).toContain('gemini-3.8-flash');
    expect(requestedUrls[2]).toContain('gemini-3.8-flash');
    expect(requestedUrls[3]).toContain('gemini-2.5-flash');
    expect(result.text).toBe('{"fallback":"success"}');
    expect(result.modelUsed).toBe('gemini-2.5-flash');
  }, 10000);

  it('throws when all retries and fallback fail', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(
      callGeminiWithRetry({
        apiKey: 'test-key',
        prompt: 'test',
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-2.5-flash',
      })
    ).rejects.toThrow('All Gemini attempts failed');
  }, 10000);
});
