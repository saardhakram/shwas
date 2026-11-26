/**
 * Vercel Serverless Function: POST /api/plan
 *
 * Thin HTTP endpoint delegating validation, caching, and Gemini orchestration
 * to `api/_lib/plan/*`.
 */

import type { ForecastDataPoint } from '../shared/forecastWindow.js';
import type { UserProfile } from '../shared/types.js';
import { ValidationError } from './_lib/errors.js';
import { assertMethod, withApiHandler } from './_lib/http.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';
import { parseRequestBody } from './_lib/types.js';
import { validatePlanRequestBody } from './_lib/validation.js';
import { processPlanRequest } from './_lib/plan/service.js';

export { processPlanRequest };

export default withApiHandler(async (req: ApiRequest, res: ApiResponse) => {
  assertMethod(req, ['POST']);

  const apiKey = process.env.GEMINI_API_KEY;
  const rawBody = parseRequestBody(req.body);
  const validationError = validatePlanRequestBody(rawBody);
  if (validationError) {
    throw new ValidationError(validationError);
  }
  const body = rawBody as {
    profile?: UserProfile;
    forecast?: ForecastDataPoint[];
  };
  const result = await processPlanRequest(body, apiKey);
  return res.status(200).json(result);
});
