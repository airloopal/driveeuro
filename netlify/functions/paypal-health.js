/**
 * netlify/functions/paypal-health.js
 *
 * Diagnostic endpoint — confirms environment variables are present
 * without exposing their values.
 *
 * GET  /.netlify/functions/paypal-health
 * Returns JSON health check payload.
 *
 * NEVER returns the actual values of PAYPAL_CLIENT_ID or
 * PAYPAL_CLIENT_SECRET — only boolean presence flags.
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
    ok:                       true,
    paypalClientIdPresent:    Boolean(process.env.PAYPAL_CLIENT_ID),
    paypalClientSecretPresent: Boolean(process.env.PAYPAL_CLIENT_SECRET),
    paypalEnv:                process.env.PAYPAL_ENV  || null,
    siteUrl:                  process.env.SITE_URL    || null,
    nodeVersion:              process.version,
    timestamp:                new Date().toISOString(),
  };

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload, null, 2),
  };
};
