/**
 * Vercel Serverless Function: POST /api/scan
 *
 * Thin HTTP endpoint delegating validation and Gemini Vision orchestration
 * to `api/_lib/scan/*`.
 */

import { ValidationError } from './_lib/errors.js';
import { assertMethod, readJsonBody, withApiHandler } from './_lib/http.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';
import { validateScanRequestBody } from './_lib/validation.js';
import { processScanRequest } from './_lib/scan/service.js';
import type {
  ScanBox,
  ScanRequestBody,
  ScanResponseBody,
  ScanSourceItem,
} from './_lib/scan/prompt.js';

export { processScanRequest };
export type { ScanBox, ScanRequestBody, ScanResponseBody, ScanSourceItem };

export default withApiHandler(async (req: ApiRequest, res: ApiResponse) => {
  assertMethod(req, ['POST'], { message: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  const rawBody = readJsonBody(req);
  const validationError = validateScanRequestBody(rawBody);
  if (validationError) {
    throw new ValidationError(validationError);
  }
  const body = rawBody as ScanRequestBody;
  const result = await processScanRequest(body, apiKey);
  return res.status(200).json(result);
});
