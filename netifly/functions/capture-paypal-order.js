/**
 * netlify/functions/capture-paypal-order.js
 *
 * Captures a PayPal order after the customer approves it on PayPal's hosted page.
 * Call this from the frontend when PayPal redirects back with ?token=ORDER_ID.
 *
 * Required env vars:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_ENV  ("sandbox" | "live")
 */

'use strict';

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

/**
 * Exchange client credentials for a short-lived PayPal OAuth access token.
 * @returns {Promise<string>} Bearer token
 */
async function getPayPalAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[capture-paypal-order] Token error:', err);
    throw new Error('Failed to obtain PayPal access token');
  }

  const data = await res.json();
  return data.access_token;
}

/** Standard CORS headers */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  // ── CORS preflight ───────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS, Allow: 'POST, OPTIONS' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  // Support both "orderId" (from create step) and "token" (PayPal URL param)
  const orderId = body.orderId || body.token;

  if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'orderId is required' }),
    };
  }

  // ── Obtain access token ──────────────────────────────────────────────
  let accessToken;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (err) {
    console.error('[capture-paypal-order] Auth failed:', err.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Payment provider unavailable. Please try again.' }),
    };
  }

  // ── Capture the order ────────────────────────────────────────────────
  let captureRes;
  try {
    captureRes = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer:         'return=representation',
        },
        // Empty body required for capture endpoint
        body: JSON.stringify({}),
      }
    );
  } catch (fetchErr) {
    console.error('[capture-paypal-order] Network error:', fetchErr.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Network error communicating with payment provider.' }),
    };
  }

  if (!captureRes.ok) {
    const errText = await captureRes.text();
    console.error('[capture-paypal-order] Capture failed:', errText);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Payment capture failed. Please contact DriveEuro.' }),
    };
  }

  const captureData = await captureRes.json();

  // Extract the primary capture unit
  const purchaseUnit  = (captureData.purchase_units || [])[0] || {};
  const captures      = (purchaseUnit.payments?.captures || [])[0] || {};
  const captureId     = captures.id || null;
  const captureStatus = captures.status || captureData.status || null;
  const captureAmount = captures.amount || null;

  // Payer info — safe fields only, no sensitive data
  const payer = captureData.payer
    ? {
        email:       captureData.payer.email_address || null,
        payerId:     captureData.payer.payer_id || null,
        firstName:   captureData.payer.name?.given_name || null,
        lastName:    captureData.payer.name?.surname || null,
        countryCode: captureData.payer.address?.country_code || null,
      }
    : null;

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success:       captureData.status === 'COMPLETED',
      orderId:       captureData.id,
      status:        captureData.status,
      captureId,
      captureStatus,
      amount:        captureAmount,
      payer,
    }),
  };
};
