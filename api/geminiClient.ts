/**
 * Shared Gemini client with resilient retry logic, fallback model switching, and request timeouts.
 *
 * Rules:
 * - Free tier is 5 requests/minute per model.
 * - On HTTP 429 (quota exhausted): do NOT retry the same model — go straight to fallback model.
 * - On HTTP 503 (service overloaded): retry once after 2s, then switch to fallback model.
 * - Max 3 Gemini calls per request total.
 * - Hard total server budget of 20 seconds.
 * - Default primary model: "gemini-3.8-flash" (or process.env.GEMINI_MODEL)
 * - Default fallback model: "gemini-3.1-flash-lite" (or process.env.GEMINI_FALLBACK_MODEL)
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
  maxServerBudgetMs?: number; // default 20000 (20s)
}

export interface GeminiCallResult {
  text: string;
  modelUsed: string;
  attempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeSingleCall(
  model: string,
  options: GeminiCallOptions,
  remainingBudgetMs: number
): Promise<{ ok: boolean; status: number; text?: string; error?: string }> {
  // Budget-constrained call timeout
  const timeoutMs = Math.max(1000, Math.min(remainingBudgetMs, 18000));
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
      error: isTimeout ? `Call timed out after ${timeoutMs}ms` : err?.message || 'Network error',
    };
  }
}

/**
 * Executes Gemini calls adhering strictly to rate-limit and overload rules:
 * - On 429: jump straight to fallback model (no retry on same model)
 * - On 503: retry once after 2s, then jump to fallback model
 * - Hard limit of max 3 calls total
 * - Hard server budget of 20s
 */
export async function callGeminiWithRetry(
  options: GeminiCallOptions
): Promise<GeminiCallResult> {
  const primaryModel =
    options.primaryModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModel =
    options.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';

  const startTime = Date.now();
  const totalBudgetMs = options.maxServerBudgetMs ?? 20000;
  let totalCalls = 0;

  const getRemainingBudget = () => totalBudgetMs - (Date.now() - startTime);

  // 1. First attempt on primary model
  if (getRemainingBudget() > 1000 && totalCalls < 3) {
    totalCalls++;
    const res1 = await executeSingleCall(primaryModel, options, getRemainingBudget());

    if (res1.ok && res1.text) {
      return { text: res1.text, modelUsed: primaryModel, attempts: totalCalls };
    }

    console.warn(
      `[GeminiClient] Call 1 to ${primaryModel} failed (status: ${res1.status}). Error: ${res1.error}`
    );

    // If 503 (Overloaded), retry primary model ONCE after 2s sleep (if budget allows)
    if (res1.status === 503 && getRemainingBudget() > 3000 && totalCalls < 3) {
      await sleep(2000);
      totalCalls++;
      const res503 = await executeSingleCall(primaryModel, options, getRemainingBudget());
      if (res503.ok && res503.text) {
        return { text: res503.text, modelUsed: primaryModel, attempts: totalCalls };
      }
      console.warn(
        `[GeminiClient] Retry after 503 to ${primaryModel} failed (status: ${res503.status}). Error: ${res503.error}`
      );
    }
    // Note: If res1.status === 429, we do NOT retry the primary model — we proceed directly to fallback
  }

  // 2. Fallback model attempt (if available, distinct, and within budget & call limit)
  if (
    fallbackModel &&
    fallbackModel !== primaryModel &&
    getRemainingBudget() > 1000 &&
    totalCalls < 3
  ) {
    totalCalls++;
    console.warn(`[GeminiClient] Switching to fallback model: ${fallbackModel} (Call ${totalCalls})`);
    const fallbackRes = await executeSingleCall(fallbackModel, options, getRemainingBudget());
    if (fallbackRes.ok && fallbackRes.text) {
      return { text: fallbackRes.text, modelUsed: fallbackModel, attempts: totalCalls };
    }
    console.warn(
      `[GeminiClient] Fallback model ${fallbackModel} failed (status: ${fallbackRes.status}). Error: ${fallbackRes.error}`
    );
  }

  throw new Error(
    `All Gemini attempts failed after ${totalCalls} calls within ${Date.now() - startTime}ms.`
  );
}
