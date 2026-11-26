/**
 * Typed HTTP error hierarchy for Vercel serverless endpoints (`/api/*`).
 */

import type { GeminiAttemptFailure } from './types.js';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly headers?: Record<string, string>;

  constructor(
    statusCode: number,
    message: string,
    code = 'API_ERROR',
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.headers = headers;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class MethodNotAllowedError extends ApiError {
  constructor(allowed: string[], message?: string) {
    const allowHeader = allowed.join(', ');
    super(405, message || `Method not allowed. Use ${allowHeader}.`, 'METHOD_NOT_ALLOWED', {
      Allow: allowHeader,
    });
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string) {
    super(429, message, 'RATE_LIMITED');
  }
}

export class UpstreamError extends ApiError {
  constructor(message: string, code = 'UPSTREAM_ERROR') {
    super(502, message, code);
  }
}

export class GeminiError extends UpstreamError {
  readonly attempts?: GeminiAttemptFailure[];

  constructor(message: string, attempts?: GeminiAttemptFailure[]) {
    super(message, 'GEMINI_ERROR');
    this.attempts = attempts;
  }
}
