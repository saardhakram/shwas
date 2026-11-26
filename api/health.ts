/**
 * Vercel Serverless Function: GET /api/health
 *
 * Lightweight warm-up endpoint called on app load to wake serverless functions.
 */

import type { ApiRequest, ApiResponse } from './_lib/types.js';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
}
