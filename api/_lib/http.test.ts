import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  GeminiError,
  MethodNotAllowedError,
  RateLimitError,
  UpstreamError,
  ValidationError,
} from './errors';
import { assertMethod, handleApiError, readJsonBody, withApiHandler } from './http';
import type { ApiRequest, ApiResponse } from './types';

function createMockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: unknown = null;

  const res: ApiResponse = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return {
        json(payload: unknown) {
          body = payload;
          return payload;
        },
      };
    },
  };

  return {
    res,
    getResult: () => ({ statusCode, body, headers }),
  };
}

describe('api/_lib/http error mapping', () => {
  it('maps ValidationError to HTTP 400', () => {
    const { res, getResult } = createMockResponse();
    handleApiError(res, new ValidationError('image is required'));
    expect(getResult()).toEqual({
      statusCode: 400,
      body: { error: 'image is required' },
      headers: {},
    });
  });

  it('maps MethodNotAllowedError to HTTP 405 with Allow header', () => {
    const { res, getResult } = createMockResponse();
    handleApiError(res, new MethodNotAllowedError(['POST']));
    expect(getResult()).toEqual({
      statusCode: 405,
      body: { error: 'Method not allowed. Use POST.' },
      headers: { Allow: 'POST' },
    });
  });

  it('maps RateLimitError to HTTP 429 and UpstreamError / GeminiError to HTTP 502', () => {
    const r1 = createMockResponse();
    handleApiError(r1.res, new RateLimitError('Too many requests'));
    expect(r1.getResult().statusCode).toBe(429);

    const r2 = createMockResponse();
    handleApiError(r2.res, new UpstreamError('Open-Meteo unavailable'));
    expect(r2.getResult().statusCode).toBe(502);

    const r3 = createMockResponse();
    handleApiError(r3.res, new GeminiError('Gemini timed out'));
    expect(r3.getResult().statusCode).toBe(502);
  });

  it('maps unexpected errors to HTTP 500 without leaking internals', () => {
    const { res, getResult } = createMockResponse();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      handleApiError(res, new Error('secret stack info'));
    } finally {
      errorSpy.mockRestore();
    }
    expect(getResult()).toEqual({
      statusCode: 500,
      body: { error: 'Internal server error.' },
      headers: {},
    });
  });

  it('assertMethod allows matching methods and throws MethodNotAllowedError otherwise', () => {
    expect(() => assertMethod({ method: 'POST' }, ['POST'])).not.toThrow();
    expect(() => assertMethod({}, ['GET', 'HEAD'], { allowMissing: true })).not.toThrow();
    expect(() => assertMethod({ method: 'DELETE' }, ['POST'])).toThrow(MethodNotAllowedError);
  });

  it('withApiHandler catches thrown ApiErrors and forwards to handleApiError', async () => {
    const handler = withApiHandler((req: ApiRequest) => {
      assertMethod(req, ['POST']);
      throw new ApiError(418, 'Teapot', 'TEAPOT');
    });

    const m1 = createMockResponse();
    await handler({ method: 'GET' }, m1.res);
    expect(m1.getResult().statusCode).toBe(405);
    expect(m1.getResult().headers.Allow).toBe('POST');

    const m2 = createMockResponse();
    await handler({ method: 'POST' }, m2.res);
    expect(m2.getResult().statusCode).toBe(418);
    expect(m2.getResult().body).toEqual({ error: 'Teapot' });
  });

  it('readJsonBody parses valid objects and throws ValidationError on malformed JSON or throwing getter', () => {
    expect(readJsonBody({ body: '{"ok":true}' })).toEqual({ ok: true });
    expect(readJsonBody({ body: Buffer.from('{"a":1}') })).toEqual({ a: 1 });
    expect(readJsonBody({ body: '' })).toEqual({});

    expect(() => readJsonBody({ body: '{not json' })).toThrow(ValidationError);
    expect(() => readJsonBody({ body: '[1,2,3]' })).toThrow(ValidationError);

    const throwingReq: ApiRequest = {
      method: 'POST',
      get body() {
        throw new Error('Invalid JSON');
      },
    };
    expect(() => readJsonBody(throwingReq)).toThrow('Request body must be valid JSON.');
  });
});
