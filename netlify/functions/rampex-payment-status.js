/**
 * netlify/functions/rampex-payment-status.js
 *
 * Retrieves the current status of a Rampex payment link by link_id.
 * Called on the return journey from Rampex checkout to verify payment completion.
 *
 * Required env vars:
 *   RAMPEX_API_KEY
 *   RAMPEX_ENV  ("live" | "sandbox")
 *
 * Endpoint used:
 *   GET https://api.rampex.io/api-get-payment-status?link_id={paymentId}
 *   Authorization: X-API-Key header
 *
 * POST /.netlify/functions/rampex-payment-status
 * Body: { paymentId, bookingReference }
 *
 * Returns:
 *   { success, status, paymentId, bookingReference, amount, currency, providerReference }
 *
 * Statuses treated as paid:
 *   paid | completed | success | captured | approved | settled
 */

'use strict';

const RAMPEX_BASE   = 'https://api.rampex.io';
const PAID_STATUSES = ['paid', 'completed', 'success', 'captured', 'approved', 'settled'];

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
    console.error('[rampex-payment-status] RAMPEX_API_KEY is not configured');
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

  console.log('[rampex-payment-status] Checking status for paymentId:', paymentId, 'ref:', bookingReference || '(none)');

  // ── Call Rampex status endpoint ──────────────────────────────────────
  // GET /api-get-payment-status?link_id={paymentId}
  const statusUrl = `${RAMPEX_BASE}/api-get-payment-status?link_id=${encodeURIComponent(paymentId)}`;

  let statusRes;
  try {
    statusRes = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': process.env.RAMPEX_API_KEY,
        Accept:      'application/json',
      },
    });
  } catch (fetchErr) {
    console.error('[rampex-payment-status] Network error:', fetchErr.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Network error communicating with payment provider.' }),
    };
  }

  // ── Read response ────────────────────────────────────────────────────
  let statusData = null;
  let rawBodyText = '';

  try {
    rawBodyText = await statusRes.text();
    statusData  = JSON.parse(rawBodyText);
  } catch {
    statusData = null;
  }

  console.log('[rampex-payment-status] Provider HTTP status:', statusRes.status);
  console.log('[rampex-payment-status] Provider response body:', rawBodyText.slice(0, 500));

  if (!statusRes.ok) {
    console.error('[rampex-payment-status] Error from provider:', statusRes.status);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error:          'Could not retrieve payment status.',
        providerStatus: statusRes.status,
      }),
    };
  }

  if (!statusData) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Non-JSON response from payment provider.' }),
    };
  }

  // ── Normalise response ───────────────────────────────────────────────
  // Rampex may nest data under a `data` key or return it at the top level.
  const d = (statusData.data && typeof statusData.data === 'object')
    ? statusData.data
    : statusData;

  const rawStatus = (
    d.status         ||
    d.payment_status ||
    d.state          ||
    statusData.status ||
    ''
  ).toString().toLowerCase();

  const isPaid = PAID_STATUSES.includes(rawStatus);

  const amount   = d.amount   || d.total  || statusData.amount   || null;
  const currency = d.currency || d.currency_code || statusData.currency || null;

  const providerReference = (
    d.transaction_id      ||
    d.transactionId       ||
    d.provider_reference  ||
    d.providerReference   ||
    d.charge_id           ||
    d.link_id             ||
    d.payment_id          ||
    d.id                  ||
    statusData.id         ||
    null
  );

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success:          isPaid,
      status:           rawStatus || 'unknown',
      paymentId,
      bookingReference: bookingReference || null,
      amount,
      currency,
      providerReference,
    }),
  };
};
