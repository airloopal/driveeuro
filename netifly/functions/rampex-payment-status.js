/**
 * netlify/functions/rampex-payment-status.js
 *
 * Retrieves the status of a Rampex payment by paymentId.
 * Called on the return journey from Rampex checkout to verify payment completion.
 *
 * Required env vars:
 *   RAMPEX_API_KEY
 *   RAMPEX_ENV  ("live" | "sandbox")
 *
 * Endpoint:
 *   POST /.netlify/functions/rampex-payment-status
 *
 * Body:
 *   paymentId        {string}  Rampex payment ID returned by create-rampex-payment-link
 *   bookingReference {string}  DriveEuro booking reference (for logging/correlation)
 *
 * Returns:
 *   { success, status, paymentId, bookingReference, amount, currency, providerReference }
 *
 * ── Rampex status endpoint note ──────────────────────────────────────────────
 * The likely Rampex status endpoint is:
 *   POST https://api.rampex.io/api-payment-status
 *   Body: { payment_id: paymentId }
 *
 * If Rampex uses a GET endpoint with path param instead, replace the fetch call below with:
 *   GET https://api.rampex.io/api-payment-status/{paymentId}
 *
 * Statuses indicating successful payment (checked case-insensitively):
 *   paid | completed | success | captured | approved | settled
 * ────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const RAMPEX_BASE = 'https://api.rampex.io';

const PAID_STATUSES = ['paid', 'completed', 'success', 'captured', 'approved', 'settled'];

/** Standard CORS headers */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
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

  // ── Validate environment ─────────────────────────────────────────────
  if (!process.env.RAMPEX_API_KEY) {
    console.error('[rampex-payment-status] RAMPEX_API_KEY is not set');
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Payment provider not configured.' }),
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

  const { paymentId, bookingReference } = body;

  if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'paymentId is required' }),
    };
  }

  // ── Call Rampex payment status endpoint ──────────────────────────────
  // Using POST /api-payment-status with { payment_id } body.
  // If Rampex provides a GET endpoint, update this block accordingly.
  let statusRes;
  try {
    statusRes = await fetch(`${RAMPEX_BASE}/api-payment-status`, {
      method: 'POST',
      headers: {
        'X-API-Key':    process.env.RAMPEX_API_KEY,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({ payment_id: paymentId }),
    });
  } catch (fetchErr) {
    console.error('[rampex-payment-status] Network error:', fetchErr.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Network error communicating with payment provider.' }),
    };
  }

  // ── Parse response ───────────────────────────────────────────────────
  let statusData;
  try {
    statusData = await statusRes.json();
  } catch {
    const raw = await statusRes.text().catch(() => '');
    console.error('[rampex-payment-status] Non-JSON response:', raw);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Unexpected response from payment provider.' }),
    };
  }

  if (!statusRes.ok) {
    console.error('[rampex-payment-status] Error response:', JSON.stringify(statusData));
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error: statusData.message || statusData.error || 'Could not retrieve payment status.',
      }),
    };
  }

  // Normalise status field — Rampex may use status, payment_status, or state
  const rawStatus = (
    statusData.status         ||
    statusData.payment_status ||
    statusData.state          ||
    ''
  ).toLowerCase();

  const isPaid = PAID_STATUSES.includes(rawStatus);

  // Extract amount and currency safely
  const amount   = statusData.amount   || statusData.total  || null;
  const currency = statusData.currency || statusData.currency_code || null;

  // Extract provider/transaction reference
  const providerReference = (
    statusData.transaction_id     ||
    statusData.transactionId      ||
    statusData.provider_reference ||
    statusData.providerReference  ||
    statusData.charge_id          ||
    statusData.id                 ||
    null
  );

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success:           isPaid,
      status:            rawStatus || 'unknown',
      paymentId,
      bookingReference:  bookingReference || null,
      amount,
      currency,
      providerReference,
    }),
  };
};
