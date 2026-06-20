/**
 * api/rampex-health.js
 *
 * Diagnostic health check for DriveEuro payment provider configuration.
 * Returns environment variable presence flags — never returns secret values.
 *
 * GET /api/rampex-health
 *
 * Required env vars (Vercel dashboard → Settings → Environment Variables):
 *   RAMPEX_API_KEY
 *   RAMPEX_ENV    ("live" | "sandbox")
 *   SITE_URL      (e.g. https://your-project.vercel.app)
 */

'use strict';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    ok:                  true,
    rampexApiKeyPresent: Boolean(process.env.RAMPEX_API_KEY),
    rampexEnv:           process.env.RAMPEX_ENV  || null,
    siteUrl:             process.env.SITE_URL     || null,
    nodeVersion:         process.version,
    timestamp:           new Date().toISOString(),
  });
}
