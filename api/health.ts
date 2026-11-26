/**
 * Vercel Serverless Function: GET /api/health
 *
 * Lightweight warm-up endpoint called on app load to wake serverless functions.
 */

import { assertMethod, withApiHandler } from './_lib/http.js';
import type { ApiRequest, ApiResponse } from './_lib/types.js';

export default withApiHandler((req: ApiRequest, res: ApiResponse) => {
  assertMethod(req, ['GET', 'HEAD'], {
    allowMissing: true,
    message: 'Method not allowed. Use GET.',
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
});
