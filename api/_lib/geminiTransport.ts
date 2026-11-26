/**
 * Low-level Gemini REST HTTP transport helpers (payload builder, response parser, single attempt).
 */

import type {
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
  GeminiGenerationConfig,
  GeminiRequestPart,
} from './types.js';
import { getErrorMessage } from './types.js';
import { serverLogger } from './logger.js';

export interface GeminiCallOptions {
  apiKey: string;
  primaryModel?: string;
  fallbackModel?: string;
  prompt: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  responseMimeType?: string;
  maxServerBudgetMs?: number;
}

export interface GeminiCallResult {
  text: string;
  modelUsed: string;
  attempts: number;
}

export interface SingleCallOutcome {
  ok: boolean;
  status: number;
  text?: string;
  error?: string;
}

export function buildGeminiPayload(
  model: string,
  options: GeminiCallOptions,
): GeminiGenerateContentRequest {
  const parts: GeminiRequestPart[] = [{ text: options.prompt }];
  if (options.inlineData) {
    parts.push({
      inlineData: {
        mimeType: options.inlineData.mimeType,
        data: options.inlineData.data,
      },
    });
  }

  const generationConfig: GeminiGenerationConfig = {
    temperature: options.temperature ?? 0.3,
    responseMimeType: options.responseMimeType ?? 'application/json',
  };
  if (typeof options.maxOutputTokens === 'number' && options.maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = options.maxOutputTokens;
  }
  if (options.thinkingLevel && model.startsWith('gemini-3')) {
    generationConfig.thinkingConfig = { thinkingLevel: options.thinkingLevel };
  }

  return { contents: [{ parts }], generationConfig };
}

export function extractCandidateText(json: GeminiGenerateContentResponse): string | null {
  const responseParts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(responseParts)) return null;
  const nonThought = responseParts.find((p) => typeof p?.text === 'string' && !p?.thought);
  const candidateText =
    nonThought?.text ?? responseParts.find((p) => typeof p?.text === 'string')?.text;
  return typeof candidateText === 'string' && candidateText.trim().length > 0
    ? candidateText
    : null;
}

export async function callGeminiOnce(
  model: string,
  options: GeminiCallOptions,
  timeoutMs: number,
): Promise<SingleCallOutcome> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(buildGeminiPayload(model, options)),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch((readErr: unknown) => {
        serverLogger.warn('[GeminiClient] Failed to read error response body:', readErr);
        return '';
      });
      return { ok: false, status: res.status, error: errBody };
    }

    const json = (await res.json()) as GeminiGenerateContentResponse;
    const candidateText = extractCandidateText(json);
    if (!candidateText) {
      return { ok: false, status: 200, error: 'Empty candidate text in Gemini response' };
    }

    return { ok: true, status: 200, text: candidateText };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errName = err instanceof Error ? err.name : '';
    const errMsg = getErrorMessage(err);
    const isTimeout = errName === 'AbortError' || errMsg.includes('aborted');
    return {
      ok: false,
      status: isTimeout ? 408 : 500,
      error: isTimeout ? `Call timed out after ${timeoutMs}ms` : errMsg || 'Network error',
    };
  }
}
