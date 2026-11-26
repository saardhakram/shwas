/**
 * Service orchestration for `/api/scan` (image decoding, Gemini Vision call, offline fallback).
 */

import { GEMINI_SCAN_BUDGET_MS } from '../../../shared/constants.js';
import { callGeminiWithRetry } from '../geminiClient.js';
import { serverLogger } from '../logger.js';
import {
  buildScanPrompt,
  parseValidatedScanResponse,
  type ScanRequestBody,
  type ScanResponseBody,
} from './prompt.js';

function extractBase64Payload(
  image: string,
  defaultMimeType: string,
): {
  rawBase64: string;
  mimeType: string;
} {
  if (!image.includes(';base64,')) {
    return { rawBase64: image, mimeType: defaultMimeType };
  }
  const parts = image.split(';base64,');
  const matchMime = parts[0].match(/data:(.*)/);
  const mimeType = matchMime?.[1] || defaultMimeType;
  return { rawBase64: parts[1], mimeType };
}

export async function processScanRequest(
  body: ScanRequestBody,
  apiKey?: string,
): Promise<ScanResponseBody> {
  const language = body.language || 'en';

  if (!body.image) {
    return {
      room: 'other',
      sources: [],
      source: 'offline',
      message: 'No image provided for scanning.',
    };
  }

  if (!apiKey) {
    return {
      room: 'other',
      sources: [],
      source: 'offline',
      message: 'Gemini API key not configured on server.',
    };
  }

  try {
    const { rawBase64, mimeType } = extractBase64Payload(body.image, body.mimeType || 'image/jpeg');

    const geminiResult = await callGeminiWithRetry({
      apiKey,
      prompt: buildScanPrompt(language),
      inlineData: { mimeType, data: rawBase64 },
      temperature: 0.1,
      responseMimeType: 'application/json',
      maxServerBudgetMs: GEMINI_SCAN_BUDGET_MS,
    });

    const { room, sources } = parseValidatedScanResponse(geminiResult.text);
    return { room, sources, source: 'gemini' };
  } catch (err: unknown) {
    serverLogger.error('[api/scan] Failed to scan image:', err);
    return {
      room: 'other',
      sources: [],
      source: 'offline',
      message: 'Failed to analyze photo. Please try again.',
    };
  }
}
