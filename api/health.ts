/**
 * Vercel Serverless Function: GET /api/health
 *
 * Lightweight warm-up endpoint called on app load to wake serverless functions.
 */

export default function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
}
