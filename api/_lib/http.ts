/**
 * Shared HTTP method guards and centralized error-to-status mapping for `/api/*`.
 */

import { ApiError, MethodNotAllowedError, ValidationError } from './errors.js';
import { serverLogger } from './logger.js';
import { isRecord, type ApiRequest, type ApiResponse } from './types.js';

export const INVALID_JSON_ERROR = 'Request body must be valid JSON.';

/**
 * Safely reads and parses a request body (including Vercel's lazy `req.body` getter).
 * Throws ValidationError (HTTP 400) if the body is malformed JSON or not a JSON object.
 */
export function readJsonBody(req: ApiRequest): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = req.body;
  } catch (err: unknown) {
    serverLogger.warn('[api] Failed to read JSON request body:', err);
    throw new ValidationError(INVALID_JSON_ERROR);
  }

  if (raw === undefined || raw === null) {
    return {};
  }

  if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!isRecord(parsed)) {
        throw new ValidationError(INVALID_JSON_ERROR);
      }
      return parsed;
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      serverLogger.warn('[api] Failed to parse JSON request body:', err);
      throw new ValidationError(INVALID_JSON_ERROR);
    }
  }

  if (!isRecord(raw)) {
    throw new ValidationError(INVALID_JSON_ERROR);
  }

  return raw;
}

/**
 * Ensures the request uses one of the permitted HTTP methods.
 * When `allowMissing` is true, an undefined method is accepted (e.g. health checks).
 */
export function assertMethod(
  req: ApiRequest,
  allowed: string[],
  options?: { allowMissing?: boolean; message?: string },
): void {
  const method = req.method;
  if (!method && options?.allowMissing) return;
  if (!method || !allowed.includes(method)) {
    throw new MethodNotAllowedError(allowed, options?.message);
  }
}

/**
 * Maps typed ApiError instances and unexpected errors to consistent HTTP JSON responses.
 */
export function handleApiError(res: ApiResponse, err: unknown): unknown {
  if (err instanceof ApiError) {
    if (err.headers) {
      for (const [name, value] of Object.entries(err.headers)) {
        res.setHeader(name, value);
      }
    }
    return res.status(err.statusCode).json({ error: err.message });
  }

  serverLogger.error('[api] Unhandled server error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}

/**
 * Wraps an endpoint handler so thrown ApiErrors and unexpected errors are mapped uniformly.
 */
export function withApiHandler(
  fn: (req: ApiRequest, res: ApiResponse) => Promise<unknown> | unknown,
): (req: ApiRequest, res: ApiResponse) => Promise<unknown> {
  return async (req: ApiRequest, res: ApiResponse) => {
    try {
      return await fn(req, res);
    } catch (err: unknown) {
      return handleApiError(res, err);
    }
  };
}
