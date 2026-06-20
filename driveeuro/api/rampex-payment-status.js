/**
 * api/rampex-payment-status.js
 *
 * Retrieves the current status of a Rampex payment link by link_id.
 * Called on the return journey from Rampex checkout to verify payment.
 *
 * POST /api/rampex-payment-status
 *
 * Required env vars:
 *   RAMPEX_API_KEY
 *   RAMPEX_ENV  ("live" | "sandbox")
 *
 * Rampex endpoint used:
 *   GET https://api.rampex.io/api-get-payment-status?link_id={paymentId}
 *
 * Request body:
 *   paymentId        {string}  Rampex link_id / payment_id
 *   bookingReference {string}  DriveEuro booking reference (for correlation)
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

export default async function handler(req, res) {
  // ── CORS ─────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate environment ─────────────────────────────────────────────
  if (!process.env.RAMPEX_API_KEY) {
    console.error('[rampex-payment-status] RAMPEX_API_KEY is not configured');
    return res.status(500).json({ error: 'Payment provider not configured.' });
  }

  // ── Parse body ───────────────────────────────────────────────────────
  const { paymentId, bookingReference } = req.body || {};

  if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  console.log('[rampex-payment-status] Checking status for paymentId:', paymentId,
              'ref:', bookingReference || '(none)');

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
    return res.status(502).json({ error: 'Network error communicating with payment provider.' });
  }

  // ── Read response ────────────────────────────────────────────────────
  let statusData  = null;
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
    return res.status(502).json({
      error:          'Could not retrieve payment status.',
      providerStatus: statusRes.status,
    });
  }

  if (!statusData) {
    return res.status(502).json({ error: 'Non-JSON response from payment provider.' });
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

  const amount   = d.amount   || d.total           || statusData.amount   || null;
  const currency = d.currency || d.currency_code   || statusData.currency || null;

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

  return res.status(200).json({
    success:          isPaid,
    status:           rawStatus || 'unknown',
    paymentId,
    bookingReference: bookingReference || null,
    amount,
    currency,
    providerReference,
  });
}
