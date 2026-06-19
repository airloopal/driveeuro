/**
 * netlify/functions/rampex-health.js
 *
 * Diagnostic endpoint — confirms Rampex environment variables are present
 * without exposing their values.
 *
 * GET  /.netlify/functions/rampex-health
 *
 * Required env vars (Netlify UI → Site settings → Environment variables):
 *   RAMPEX_API_KEY
 *   RAMPEX_ENV    ("live" | "sandbox")
 *   SITE_URL      (e.g. https://driveeuro.netlify.app)
 */

'use strict';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  // ── CORS preflight ─────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...CORS, Allow: 'GET, OPTIONS' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // ── Build response — presence flags only, never secret values ──────
  const payload = {
    ok:                  true,
    rampexApiKeyPresent: Boolean(process.env.RAMPEX_API_KEY),
    rampexEnv:           process.env.RAMPEX_ENV  || null,
    siteUrl:             process.env.SITE_URL     || null,
    nodeVersion:         process.version,
    timestamp:           new Date().toISOString(),
  };

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload, null, 2),
  };
};
