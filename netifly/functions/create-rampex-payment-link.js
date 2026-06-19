/**
 * netlify/functions/create-rampex-payment-link.js
 *
 * Creates a Rampex hosted payment link for a DriveEuro reservation fee.
 * RAMPEX_API_KEY stays in this server-side function and is never sent to
 * the browser.
 *
 * Required env vars (Netlify UI → Site settings → Environment variables):
 *   RAMPEX_API_KEY  – Rampex secret API key
 *   RAMPEX_ENV      – "live" | "sandbox"  (informational; base URL is fixed)
 *   SITE_URL        – canonical site URL, e.g. https://driveeuro.netlify.app
 *
 * Endpoint:
 *   POST /.netlify/functions/create-rampex-payment-link
 *
 * Body:
 *   amount           {number}  Reservation fee in selected currency
 *   currency         {string}  GBP | EUR | USD
 *   bookingReference {string}  DriveEuro booking reference (idempotency key)
 *   vehicleName      {string}
 *   customerEmail    {string}
 *   customerName     {string}
 *   paymentMethod    {string}  "rampex" | "card"
 *   trip             {object}  Trip detail metadata
 *
 * Returns:
 *   { paymentId, status, paymentUrl, rawProviderStatus }
 */

'use strict';

const RAMPEX_BASE        = 'https://api.rampex.io';
const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'USD'];

/** Standard CORS headers */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Extract the payment URL from the Rampex response object.
 * Rampex documentation may use different field names across versions —
 * this helper checks all known possibilities in priority order.
 */
function extractPaymentUrl(data) {
  return (
    data.payment_url  ||
    data.paymentUrl   ||
    data.checkout_url ||
    data.checkoutUrl  ||
    data.short_url    ||
    data.shortUrl     ||
    data.url          ||
    data.link         ||
    null
  );
}

/**
 * Extract the payment ID from the Rampex response object.
 */
function extractPaymentId(data) {
  return (
    data.payment_id ||
    data.paymentId  ||
    data.id         ||
    null
  );
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
    console.error('[create-rampex-payment-link] RAMPEX_API_KEY is not set');
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Payment provider not configured. Please contact DriveEuro.' }),
    };
  }

  // ── Parse & validate body ────────────────────────────────────────────
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

  // Validate amount
  const amountNum = parseFloat(amount);
  if (!amountNum || amountNum <= 0) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'amount must be a positive number' }),
    };
  }

  // Validate currency
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

  // Validate required fields
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

  // ── Build Rampex payload ─────────────────────────────────────────────
  const rampexPayload = {
    amount:         amountNum,
    currency:       currencyCode,
    title:          'DriveEuro Reservation Fee',
    description:    `DriveEuro reservation fee - ${vehicleName || 'vehicle'} - ${bookingReference}`,
    customer_email: customerEmail,
    reference:      bookingReference,
    success_url:    successUrl,
    cancel_url:     cancelUrl,
    metadata: {
      bookingReference,
      vehicleName:   vehicleName   || '',
      customerName:  customerName  || '',
      paymentMethod: paymentMethod || 'rampex',
      trip,
      source: 'driveeuro',
    },
  };

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
    console.error('[create-rampex-payment-link] Network error:', fetchErr.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Network error communicating with payment provider.' }),
    };
  }

  // ── Parse Rampex response ────────────────────────────────────────────
  let rampexData;
  try {
    rampexData = await rampexRes.json();
  } catch {
    const raw = await rampexRes.text().catch(() => '');
    console.error('[create-rampex-payment-link] Non-JSON response from Rampex:', raw);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Unexpected response from payment provider.' }),
    };
  }

  if (!rampexRes.ok) {
    console.error('[create-rampex-payment-link] Rampex error response:', JSON.stringify(rampexData));
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: rampexData.message || rampexData.error || 'Failed to create payment link. Please try again.' }),
    };
  }

  // Extract URL and ID — support all known Rampex field name variants
  const paymentUrl = extractPaymentUrl(rampexData);
  const paymentId  = extractPaymentId(rampexData);

  if (!paymentUrl) {
    console.error('[create-rampex-payment-link] No payment URL in Rampex response:', JSON.stringify(rampexData));
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Payment provider did not return a checkout URL. Please try again.' }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentId:         paymentId  || null,
      status:            rampexData.status || 'created',
      paymentUrl,
      rawProviderStatus: rampexData.status || null,
    }),
  };
};
