/**
 * Shared HTTP method guards and centralized error-to-status mapping for `/api/*`.
 */

import { ApiError, MethodNotAllowedError } from './errors.js';
import { serverLogger } from './logger.js';
import type { ApiRequest, ApiResponse } from './types.js';

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
