/**
 * Vercel Serverless Function: POST /api/ask
 *
 * Thin HTTP endpoint delegating validation, rate limiting, and Gemini orchestration
 * to `api/_lib/ask/*`.
 */

import { ValidationError } from './_lib/errors.js';
import { assertMethod, readJsonBody, withApiHandler } from './_lib/http.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';
import { validateAskRequestBody } from './_lib/validation.js';
import { processAskRequest } from './_lib/ask/service.js';
import {
  buildTimeMiniCard,
  DAILY_QUESTION_LIMIT,
  parseHourFromQuestion,
  type AskHistoryTurn,
  type AskMiniCard,
  type AskRequestBody,
  type AskResponseBody,
} from './_lib/ask/schema.js';

export { processAskRequest, buildTimeMiniCard, DAILY_QUESTION_LIMIT, parseHourFromQuestion };
export type { AskHistoryTurn, AskMiniCard, AskRequestBody, AskResponseBody };

export default withApiHandler(async (req: ApiRequest, res: ApiResponse) => {
  assertMethod(req, ['POST']);

  const apiKey = process.env.GEMINI_API_KEY;
  const rawBody = readJsonBody(req);
  const validationError = validateAskRequestBody(rawBody);
  if (validationError) {
    throw new ValidationError(validationError);
  }
  const body = rawBody as AskRequestBody;
  const forwarded = req.headers?.['x-forwarded-for'];
  const clientIp =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress) ||
    'anonymous';

  const result = await processAskRequest(body, apiKey, clientIp);
  return res.status(200).json(result);
});
