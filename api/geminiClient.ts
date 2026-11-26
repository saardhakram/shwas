/**
 * Shared Gemini client with resilient retry logic, fallback model switching, and request timeouts.
 *
 * Rules:
 * - 25s timeout per call (AbortController).
 * - On HTTP 429, 500, or 503 (or network/timeout errors): retry up to 2 times with backoff (1s, then 3s).
 * - If retries fail, attempt the request with GEMINI_FALLBACK_MODEL (default: "gemini-2.5-flash").
 * - Returns null or throws if all attempts fail so calling function can drop into rule-based fallback.
 */

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
  responseMimeType?: string;
  timeoutMs?: number; // default 25000 (25s)
}

export interface GeminiCallResult {
  text: string;
  modelUsed: string;
  attempts: number;
}

const RETRY_STATUS_CODES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeSingleCall(
  model: string,
  options: GeminiCallOptions
): Promise<{ ok: boolean; status: number; text?: string; error?: string }> {
  const timeoutMs = options.timeoutMs ?? 25000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const parts: any[] = [{ text: options.prompt }];
  if (options.inlineData) {
    parts.push({
      inlineData: {
        mimeType: options.inlineData.mimeType,
        data: options.inlineData.data,
      },
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      responseMimeType: options.responseMimeType ?? 'application/json',
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: errBody };
    }

    const json = await res.json();
    const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return { ok: false, status: 200, error: 'Empty candidate text in Gemini response' };
    }

    return { ok: true, status: 200, text: candidateText };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
    return {
      ok: false,
      status: isTimeout ? 408 : 500,
      error: isTimeout ? `Request timed out after ${timeoutMs}ms` : err?.message || 'Network error',
    };
  }
}

/**
 * Calls Gemini with up to 2 retries on 429/500/503 (1s, then 3s),
 * then falls back to GEMINI_FALLBACK_MODEL if provided or default "gemini-2.5-flash".
 */
export async function callGeminiWithRetry(
  options: GeminiCallOptions
): Promise<GeminiCallResult> {
  const primaryModel =
    options.primaryModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModel =
    options.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';

  let totalAttempts = 0;

  // 1. Try primary model: initial attempt + up to 2 retries
  for (let retryIndex = 0; retryIndex <= 2; retryIndex++) {
    totalAttempts++;
    const res = await executeSingleCall(primaryModel, options);

    if (res.ok && res.text) {
      return {
        text: res.text,
        modelUsed: primaryModel,
        attempts: totalAttempts,
      };
    }

    const shouldRetry = RETRY_STATUS_CODES.has(res.status) || res.status === 408;
    console.warn(
      `[GeminiClient] Call to ${primaryModel} failed (status: ${res.status}, attempt: ${totalAttempts}). Error: ${res.error}`
    );

    if (retryIndex < 2 && shouldRetry) {
      const delay = RETRY_DELAYS_MS[retryIndex];
      await sleep(delay);
    } else if (!shouldRetry) {
      // Non-retryable error (e.g. 400 Bad Request, 403 Forbidden)
      break;
    }
  }

  // 2. Try fallback model if distinct and primary failed
  if (fallbackModel && fallbackModel !== primaryModel) {
    totalAttempts++;
    console.warn(`[GeminiClient] Switching to fallback model: ${fallbackModel}`);
    const fallbackRes = await executeSingleCall(fallbackModel, options);
    if (fallbackRes.ok && fallbackRes.text) {
      return {
        text: fallbackRes.text,
        modelUsed: fallbackModel,
        attempts: totalAttempts,
      };
    }
    console.warn(
      `[GeminiClient] Fallback model ${fallbackModel} also failed (status: ${fallbackRes.status}). Error: ${fallbackRes.error}`
    );
  }

  throw new Error(`All Gemini attempts failed after ${totalAttempts} tries.`);
}
