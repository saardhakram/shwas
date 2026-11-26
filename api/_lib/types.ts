/**
 * Shared TypeScript types for Vercel serverless functions and Gemini REST API payloads.
 */

import { serverLogger } from './logger.js';

export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): unknown };
}

export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export type GeminiRequestPart = GeminiTextPart | GeminiInlineDataPart;

export interface GeminiGenerationConfig {
  temperature: number;
  responseMimeType: string;
  maxOutputTokens?: number;
  thinkingConfig?: {
    thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  };
}

export interface GeminiGenerateContentRequest {
  contents: Array<{ parts: GeminiRequestPart[] }>;
  generationConfig: GeminiGenerationConfig;
}

export interface GeminiResponsePart {
  text?: string;
  thought?: boolean;
}

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiResponsePart[];
    };
  }>;
}

export interface GeminiAttemptFailure {
  model: string;
  status: number;
  error: string;
}

export interface GeminiClientError extends Error {
  attempts?: GeminiAttemptFailure[];
}

/**
 * Type guard verifying an unknown value is a non-null plain object record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely extracts an error message string from an unknown thrown value.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

/**
 * Safely parses a serverless request body (object or JSON string) into a record.
 */
export function parseRequestBody(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch (err: unknown) {
      serverLogger.warn('[api] Failed to parse JSON request body:', err);
      return {};
    }
  }
  return isRecord(raw) ? raw : {};
}
