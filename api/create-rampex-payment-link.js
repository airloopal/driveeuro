/**
 * api/create-rampex-payment-link.js
 *
 * Creates a Rampex hosted payment link for a DriveEuro reservation fee.
 * RAMPEX_API_KEY stays server-side only — never sent to the browser.
 *
 * POST /api/create-rampex-payment-link
 *
 * Required env vars (Vercel dashboard → Settings → Environment Variables):
 *   RAMPEX_API_KEY  – Rampex secret API key
 *   RAMPEX_ENV      – "live" | "sandbox"  (informational; base URL is always live)
 *   SITE_URL        – canonical site URL, e.g. https://your-project.vercel.app
 *
 * Request body:
 *   amount           {number}   Reservation fee in selected currency
 *   currency         {string}   GBP | EUR | USD
 *   bookingReference {string}   DriveEuro booking reference
 *   vehicleName      {string}
 *   customerEmail    {string}
 *   customerName     {string}
 *   paymentMethod    {string}   "rampex" | "card"
 *   trip             {object}   Trip metadata
 *
 * Returns:
 *   { paymentId, status, paymentUrl, rawProviderStatus }
 *
 * On error returns:
 *   { error, providerStatus, providerMessage }
 */

'use strict';

const RAMPEX_BASE          = 'https://api.rampex.io';
const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'USD'];

/**
 * Extract payment URL from Rampex response.
 * Checks top-level fields first, then nested data.* fields.
 * Covers all known Rampex field name variants.
 */
function extractPaymentUrl(data) {
  if (data.payment_url)   return data.payment_url;
  if (data.paymentUrl)    return data.paymentUrl;
  if (data.redirect_url)  return data.redirect_url;
  if (data.redirectUrl)   return data.redirectUrl;
  if (data.checkout_url)  return data.checkout_url;
  if (data.checkoutUrl)   return data.checkoutUrl;
  if (data.short_url)     return data.short_url;
  if (data.shortUrl)      return data.shortUrl;
  if (data.url)           return data.url;
  if (data.link)          return data.link;
  if (data.data && typeof data.data === 'object') {
    const d = data.data;
    if (d.payment_url)   return d.payment_url;
    if (d.redirect_url)  return d.redirect_url;
    if (d.checkout_url)  return d.checkout_url;
    if (d.short_url)     return d.short_url;
    if (d.url)           return d.url;
    if (d.link)          return d.link;
  }
  return null;
}

/**
 * Extract payment/link ID from Rampex response.
 * Covers all known Rampex field name variants.
 */
function extractPaymentId(data) {
  if (data.link_id)    return data.link_id;
  if (data.linkId)     return data.linkId;
  if (data.payment_id) return data.payment_id;
  if (data.paymentId)  return data.paymentId;
  if (data.id)         return data.id;
  if (data.data && typeof data.data === 'object') {
    const d = data.data;
    if (d.link_id)    return d.link_id;
    if (d.payment_id) return d.payment_id;
    if (d.id)         return d.id;
  }
  return null;
}

/**
 * Extract a safe human-readable message from a Rampex error response.
 * Never returns raw internal server errors, stack traces, or secrets.
 */
function extractSafeProviderMessage(data) {
  if (!data || typeof data !== 'object') return null;
  const raw =
    data.message       ||
    data.error         ||
    data.error_message ||
    data.errorMessage  ||
    data.detail        ||
    data.description   ||
    (Array.isArray(data.errors) ? data.errors[0] : null) ||
    null;
  return raw ? String(raw).slice(0, 200) : null;
}

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
    console.error('[create-rampex-payment-link] RAMPEX_API_KEY is not configured');
    return res.status(500).json({
      error:           'Unable to create payment link.',
      providerStatus:  null,
      providerMessage: 'Payment provider API key is not configured on this server.',
    });
  }

  // ── Parse body ───────────────────────────────────────────────────────
  const {
    amount,
    currency,
    bookingReference,
    vehicleName,
    customerEmail,
    customerName,
    paymentMethod,
    trip = {},
  } = req.body || {};

  // Log presence of key fields only — never log secrets or full PII
  console.log('[create-rampex-payment-link] Request received:', {
    amountPresent:        Boolean(amount),
    currencyPresent:      Boolean(currency),
    customerEmailPresent: Boolean(customerEmail),
    bookingReference:     bookingReference || '(none)',
    currency:             currency         || '(none)',
  });

  // ── Validate inputs ──────────────────────────────────────────────────
  const amountNum = parseFloat(amount);
  if (!amountNum || amountNum <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const currencyCode = (currency || 'GBP').toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currencyCode)) {
    return res.status(400).json({
      error: `Unsupported currency. Accepted: ${SUPPORTED_CURRENCIES.join(', ')}`,
    });
  }

  if (!customerEmail || !customerEmail.includes('@')) {
    return res.status(400).json({ error: 'A valid customerEmail is required' });
  }

  if (!bookingReference) {
    return res.status(400).json({ error: 'bookingReference is required' });
  }

  const siteUrl    = (process.env.SITE_URL || 'https://driveeuro.vercel.app').replace(/\/$/, '');
  const successUrl = `${siteUrl}/?payment=success`;
  const cancelUrl  = `${siteUrl}/?payment=cancelled`;

  // ── Build minimal Rampex payload ─────────────────────────────────────
  // Only the fields Rampex requires — extras are omitted until basic link creation works.
  const rampexPayload = {
    amount:         Number(amountNum.toFixed(2)),
    currency:       currencyCode,
    customer_email: customerEmail,
    description:    `DriveEuro reservation fee - ${bookingReference}`,
    provider:       'hosted',
  };

  console.log('[create-rampex-payment-link] Calling Rampex API:', {
    endpoint: `${RAMPEX_BASE}/api-create-payment-link`,
    amount:   rampexPayload.amount,
    currency: rampexPayload.currency,
  });

  // ── Call Rampex API ──────────────────────────────────────────────────
  let rampexRes;
  try {
    rampexRes = await fetch(`${RAMPEX_BASE}/api-create-payment-link`, {
      method: 'POST',
      headers: {
        'X-API-Key':    process.env.RAMPEX_API_KEY,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify(rampexPayload),
    });
  } catch (fetchErr) {
    console.error('[create-rampex-payment-link] Network error reaching Rampex:', fetchErr.message);
    return res.status(502).json({
      error:           'Unable to create payment link.',
      providerStatus:  null,
      providerMessage: 'Network error reaching payment provider.',
    });
  }

  // ── Read response body (always, even on error status) ────────────────
  let rampexData  = null;
  let rawBodyText = '';

  try {
    rawBodyText = await rampexRes.text();
    rampexData  = JSON.parse(rawBodyText);
  } catch {
    rampexData = null;
  }

  // Server-side debug — safe to log, never exposed to the browser
  console.log('[create-rampex-payment-link] Rampex response status:', rampexRes.status);
  console.log('[create-rampex-payment-link] Rampex response body:',   rawBodyText.slice(0, 1000));

  // ── Non-OK response ──────────────────────────────────────────────────
  if (!rampexRes.ok) {
    const safeMessage = rampexData ? extractSafeProviderMessage(rampexData) : null;
    console.error('[create-rampex-payment-link] Rampex error status:', rampexRes.status);
    return res.status(502).json({
      error:           'Unable to create payment link.',
      providerStatus:  rampexRes.status,
      providerMessage: safeMessage || `Provider returned status ${rampexRes.status}`,
    });
  }

  // ── Non-JSON OK response ─────────────────────────────────────────────
  if (!rampexData) {
    console.error('[create-rampex-payment-link] Rampex 2xx but response was not JSON');
    return res.status(502).json({
      error:           'Unable to create payment link.',
      providerStatus:  rampexRes.status,
      providerMessage: 'Provider returned a non-JSON response.',
    });
  }

  // ── Extract URL and ID ───────────────────────────────────────────────
  const paymentUrl = extractPaymentUrl(rampexData);
  const paymentId  = extractPaymentId(rampexData);

  if (!paymentUrl) {
    console.error(
      '[create-rampex-payment-link] No payment URL in Rampex response. Keys:',
      Object.keys(rampexData)
    );
    return res.status(502).json({
      error:           'Unable to create payment link.',
      providerStatus:  rampexRes.status,
      providerMessage: 'Provider response did not include a checkout URL.',
    });
  }

  console.log('[create-rampex-payment-link] Payment link created. paymentId:', paymentId || '(none)');

  return res.status(200).json({
    paymentId:         paymentId                        || null,
    status:            (rampexData && rampexData.status) || 'created',
    paymentUrl,
    rawProviderStatus: rampexRes.status,
  });
}
