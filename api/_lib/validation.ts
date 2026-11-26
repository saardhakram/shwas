/**
 * Runtime request body validation helpers for Vercel serverless endpoints (`/api/*`).
 *
 * Returns a human-readable error message when invalid (for HTTP 400 responses),
 * or `null` when the payload passes validation.
 */

import { isRecord } from './types.js';

/** Maximum allowed decoded image payload size for `/api/scan` (5 MB). */
export const MAX_SCAN_IMAGE_BYTES = 5 * 1024 * 1024;

/** Maximum allowed base64/data-URL string length (~5 MB decoded + data URL prefix). */
export const MAX_SCAN_IMAGE_CHARS = Math.ceil((MAX_SCAN_IMAGE_BYTES * 4) / 3) + 256;

/** Maximum allowed question length for `/api/ask`. */
export const MAX_ASK_QUESTION_CHARS = 1000;

/** Validates the request body for `POST /api/plan`. */
export function validatePlanRequestBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Request body must be a JSON object.';

  if (body.profile !== undefined) {
    if (!isRecord(body.profile)) return 'profile must be an object.';
    if (body.profile.language !== undefined) {
      if (typeof body.profile.language !== 'string' || body.profile.language.length > 16) {
        return 'profile.language must be a short language code string.';
      }
    }
    if (body.profile.family !== undefined) {
      if (!Array.isArray(body.profile.family) || body.profile.family.length > 20) {
        return 'profile.family must be an array of at most 20 members.';
      }
    }
  }

  if (body.forecast !== undefined) {
    if (!Array.isArray(body.forecast) || body.forecast.length > 120) {
      return 'forecast must be an array of at most 120 hourly points.';
    }
  }

  return null;
}

/** Validates the request body for `POST /api/scan`. */
export function validateScanRequestBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Request body must be a JSON object.';

  if (typeof body.image !== 'string' || body.image.trim().length === 0) {
    return 'image must be a non-empty base64 string or data URL.';
  }

  if (body.image.length > MAX_SCAN_IMAGE_CHARS) {
    return 'image exceeds the maximum allowed size of 5 MB.';
  }

  if (body.mimeType !== undefined) {
    if (typeof body.mimeType !== 'string' || !body.mimeType.startsWith('image/')) {
      return 'mimeType must be a valid image/* MIME type.';
    }
  }

  if (body.language !== undefined) {
    if (typeof body.language !== 'string' || body.language.length > 16) {
      return 'language must be a short language code string.';
    }
  }

  return null;
}

/** Validates the request body for `POST /api/ask`. */
export function validateAskRequestBody(body: unknown): string | null {
  if (!isRecord(body)) return 'Request body must be a JSON object.';

  if (typeof body.question !== 'string' || body.question.trim().length === 0) {
    return 'question must be a non-empty string.';
  }

  if (body.question.length > MAX_ASK_QUESTION_CHARS) {
    return `question exceeds the maximum length of ${MAX_ASK_QUESTION_CHARS} characters.`;
  }

  if (body.history !== undefined) {
    if (!Array.isArray(body.history) || body.history.length > 20) {
      return 'history must be an array of at most 20 turns.';
    }
  }

  if (body.currentPm25 !== undefined && typeof body.currentPm25 !== 'number') {
    return 'currentPm25 must be a number.';
  }

  if (body.currentAqi !== undefined && typeof body.currentAqi !== 'number') {
    return 'currentAqi must be a number.';
  }

  return null;
}
