import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler, { processScanRequest } from './scan.js';
import { MAX_SCAN_IMAGE_CHARS } from './_lib/validation.js';
import type {
  ApiRequest,
  ApiResponse,
  GeminiGenerateContentRequest,
  GeminiInlineDataPart,
} from './_lib/types.js';

describe('/api/scan serverless handler', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns offline failure if no image provided', async () => {
    const result = await processScanRequest({}, 'mock-key');
    expect(result.source).toBe('offline');
    expect(result.sources).toEqual([]);
    expect(result.message).toContain('No image');
  });

  it('returns offline failure if no API key provided', async () => {
    const result = await processScanRequest({ image: 'base64sampledata' }, undefined);
    expect(result.source).toBe('offline');
    expect(result.sources).toEqual([]);
    expect(result.message).toContain('API key not configured');
  });

  it('calls Gemini with x-goog-api-key header and parses valid response', async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  room: 'living',
                  sources: [
                    {
                      id: 'incense',
                      label: 'Agarbatti Smoke',
                      box: { x: 0.2, y: 0.3, w: 0.15, h: 0.25 },
                      confidence: 0.95,
                    },
                    {
                      id: 'open_window_road',
                      label: 'Road Ingress',
                      box: { x: 0.6, y: 0.1, w: 0.3, h: 0.5 },
                      confidence: 0.88,
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    let requestedHeaders: Record<string, string> = {};
    let requestedUrl = '';
    let requestedBody: Partial<GeminiGenerateContentRequest> = {};

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      requestedUrl = url;
      requestedHeaders = (opts?.headers as Record<string, string>) || {};
      requestedBody = JSON.parse(String(opts?.body || '{}')) as GeminiGenerateContentRequest;
      return {
        ok: true,
        status: 200,
        json: async () => mockGeminiResponse,
      };
    });

    const result = await processScanRequest(
      {
        image: 'data:image/jpeg;base64,sampleimagebytes',
        language: 'hi',
      },
      'test-gemini-key',
    );

    expect(requestedUrl).toContain('gemini-3.5-flash:generateContent');
    expect(requestedHeaders['x-goog-api-key']).toBe('test-gemini-key');
    expect(requestedBody.generationConfig?.responseMimeType).toBe('application/json');
    const secondPart = requestedBody.contents?.[0]?.parts[1] as GeminiInlineDataPart;
    expect(secondPart.inlineData.data).toBe('sampleimagebytes');

    expect(result.source).toBe('gemini');
    expect(result.room).toBe('living');
    expect(result.sources.length).toBe(2);
    expect(result.sources[0].id).toBe('incense');
    expect(result.sources[0].box.x).toBe(0.2);
  });

  it('handles non-200 API error safely and returns offline fallback', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 403,
        text: async () => 'API key invalid',
      };
    });

    const result = await processScanRequest({ image: 'base64data' }, 'invalid-key');

    expect(result.source).toBe('offline');
    expect(result.sources).toEqual([]);
    expect(result.message).toContain('Failed to analyze photo');
  });

  it('normalizes invalid IDs and clamps box coordinates', async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  room: 'unknown_hall',
                  sources: [
                    {
                      id: 'alien_laser',
                      label: 'Laser Beam',
                      box: { x: -0.5, y: 1.5, w: 2.0, h: 2.0 },
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockGeminiResponse,
    });

    const result = await processScanRequest({ image: 'base64sample' }, 'test-key');

    expect(result.source).toBe('gemini');
    expect(result.room).toBe('other');
    expect(result.sources[0].id).toBe('other');
    expect(result.sources[0].box.x).toBe(0);
    expect(result.sources[0].box.y).toBe(1);
  });

  it('returns HTTP 400 when image is missing or exceeds 5 MB limit', async () => {
    const invoke = async (body: unknown) => {
      let statusCode = 0;
      let payload: unknown = null;
      const req: ApiRequest = { method: 'POST', body };
      const res: ApiResponse = {
        setHeader: vi.fn(),
        status: (code: number) => {
          statusCode = code;
          return {
            json: (b: unknown) => {
              payload = b;
              return b;
            },
          };
        },
      };
      await handler(req, res);
      return { statusCode, payload };
    };

    const missing = await invoke({});
    expect(missing.statusCode).toBe(400);
    expect(missing.payload).toMatchObject({ error: expect.stringContaining('image') });

    const oversized = await invoke({ image: 'A'.repeat(MAX_SCAN_IMAGE_CHARS + 10) });
    expect(oversized.statusCode).toBe(400);
    expect(oversized.payload).toMatchObject({ error: expect.stringContaining('5 MB') });
  });

  it('returns HTTP 400 on malformed JSON body or throwing req.body getter', async () => {
    const invoke = async (req: ApiRequest) => {
      let statusCode = 0;
      let payload: unknown = null;
      const res: ApiResponse = {
        setHeader: vi.fn(),
        status: (code: number) => {
          statusCode = code;
          return {
            json: (b: unknown) => {
              payload = b;
              return b;
            },
          };
        },
      };
      await handler(req, res);
      return { statusCode, payload };
    };

    const strResult = await invoke({ method: 'POST', body: '{not json' });
    expect(strResult).toEqual({
      statusCode: 400,
      payload: { error: 'Request body must be valid JSON.' },
    });

    const getterResult = await invoke({
      method: 'POST',
      get body() {
        throw new Error('Invalid JSON');
      },
    });
    expect(getterResult).toEqual({
      statusCode: 400,
      payload: { error: 'Request body must be valid JSON.' },
    });
  });
});
