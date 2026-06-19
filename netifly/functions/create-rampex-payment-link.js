/**
 * netlify/functions/create-rampex-payment-link.js
 *
 * Creates a Rampex hosted payment link for a DriveEuro reservation fee.
 * RAMPEX_API_KEY stays server-side only — never sent to the browser.
 *
 * Required env vars (Netlify UI → Site settings → Environment variables):
 *   RAMPEX_API_KEY  – Rampex secret API key
 *   RAMPEX_ENV      – "live" | "sandbox"  (informational; base URL is fixed to live)
 *   SITE_URL        – canonical site URL, e.g. https://driveeuro.netlify.app
 *
 * POST /.netlify/functions/create-rampex-payment-link
 *
 * Body fields accepted:
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

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Extract payment URL from Rampex response.
 * Checks top-level fields first, then data.* nested fields.
 * Covers all known Rampex field name variants.
 */
function extractPaymentUrl(data) {
  // Top-level variants
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
  // Nested under data.*
  if (data.data) {
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
  if (data.data) {
    const d = data.data;
    if (d.link_id)    return d.link_id;
    if (d.payment_id) return d.payment_id;
    if (d.id)         return d.id;
  }
  return null;
}

/**
 * Extract a safe human-readable message from a Rampex error response.
 * Never returns raw internal server errors or stack traces.
 */
function extractSafeProviderMessage(data) {
  if (!data || typeof data !== 'object') return null;
  // Common Rampex error field names
  const raw =
    data.message        ||
    data.error          ||
    data.error_message  ||
    data.errorMessage   ||
    data.detail         ||
    data.description    ||
    (data.errors && Array.isArray(data.errors) ? data.errors[0] : null) ||
    null;
  if (!raw) return null;
  // Truncate and return as string — do not expose internal paths or tokens
  return String(raw).slice(0, 200);
}

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
    console.error('[create-rampex-payment-link] RAMPEX_API_KEY is not configured');
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error:           'Unable to create payment link.',
        providerStatus:  null,
        providerMessage: 'Payment provider API key is not configured on this server.',
      }),
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

  const {
    amount,
    currency,
    bookingReference,
    vehicleName,
    customerEmail,
    customerName,
    paymentMethod,
    trip = {},
  } = body;

  // Log presence of key fields — never log secrets or full PII
  console.log('[create-rampex-payment-link] Request received:', {
    amountPresent:        Boolean(amount),
    currencyPresent:      Boolean(currency),
    customerEmailPresent: Boolean(customerEmail),
    bookingReference:     bookingReference || '(none)',
    currency:             currency || '(none)',
  });

  // ── Validate inputs ──────────────────────────────────────────────────
  const amountNum = parseFloat(amount);
  if (!amountNum || amountNum <= 0) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'amount must be a positive number' }),
    };
  }

  const currencyCode = (currency || 'GBP').toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currencyCode)) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({
        error: `Unsupported currency. Accepted: ${SUPPORTED_CURRENCIES.join(', ')}`,
      }),
    };
  }

  if (!customerEmail || !customerEmail.includes('@')) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'A valid customerEmail is required' }),
    };
  }

  if (!bookingReference) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'bookingReference is required' }),
    };
  }

  const siteUrl    = (process.env.SITE_URL || 'https://driveeuro.netlify.app').replace(/\/$/, '');
  const successUrl = `${siteUrl}/?payment=success&provider=rampex&booking=${encodeURIComponent(bookingReference)}`;
  const cancelUrl  = `${siteUrl}/?payment=cancelled&provider=rampex&booking=${encodeURIComponent(bookingReference)}`;

  // ── Build minimal Rampex payload ─────────────────────────────────────
  // Sending only the fields Rampex requires to create a payment link.
  // Metadata and extra fields are omitted until the basic link creation works.
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
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error:           'Unable to create payment link.',
        providerStatus:  null,
        providerMessage: 'Network error reaching payment provider.',
      }),
    };
  }

  // ── Read response body (always, even on error) ───────────────────────
  let rampexData = null;
  let rawBodyText = '';

  try {
    rawBodyText = await rampexRes.text();
    rampexData  = JSON.parse(rawBodyText);
  } catch {
    // Response was not JSON
    rampexData = null;
  }

  // Server-side debug logging — safe to log, never exposed to browser
  console.log('[create-rampex-payment-link] Rampex response status:', rampexRes.status);
  console.log('[create-rampex-payment-link] Rampex response body:', rawBodyText.slice(0, 1000));

  // ── Handle non-OK response ───────────────────────────────────────────
  if (!rampexRes.ok) {
    const safeMessage = rampexData ? extractSafeProviderMessage(rampexData) : null;
    console.error('[create-rampex-payment-link] Rampex returned error status', rampexRes.status);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error:           'Unable to create payment link.',
        providerStatus:  rampexRes.status,
        providerMessage: safeMessage || `Provider returned status ${rampexRes.status}`,
      }),
    };
  }

  // ── Handle empty / non-JSON OK response ─────────────────────────────
  if (!rampexData) {
    console.error('[create-rampex-payment-link] Rampex 2xx but response was not JSON');
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error:           'Unable to create payment link.',
        providerStatus:  rampexRes.status,
        providerMessage: 'Provider returned a non-JSON response.',
      }),
    };
  }

  // ── Extract URL and ID ───────────────────────────────────────────────
  const paymentUrl = extractPaymentUrl(rampexData);
  const paymentId  = extractPaymentId(rampexData);

  if (!paymentUrl) {
    console.error('[create-rampex-payment-link] No payment URL found in Rampex response. Keys present:', Object.keys(rampexData));
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error:           'Unable to create payment link.',
        providerStatus:  rampexRes.status,
        providerMessage: 'Provider response did not include a checkout URL.',
      }),
    };
  }

  console.log('[create-rampex-payment-link] Payment link created. paymentId:', paymentId || '(none)');

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentId:         paymentId  || null,
      status:            (rampexData && rampexData.status) || 'created',
      paymentUrl,
      rawProviderStatus: rampexRes.status,
    }),
  };
};
