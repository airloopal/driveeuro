/**
 * netlify/functions/create-paypal-order.js
 *
 * Creates a PayPal order (intent=CAPTURE) for a DriveEuro reservation fee.
 * Secrets live in Netlify environment variables — never in the frontend HTML.
 *
 * Required env vars (set in Netlify UI > Site settings > Environment variables):
 *   PAYPAL_CLIENT_ID      – PayPal app client ID
 *   PAYPAL_CLIENT_SECRET  – PayPal app client secret
 *   PAYPAL_ENV            – "sandbox" | "live"  (default: sandbox)
 *   SITE_URL              – canonical site URL, e.g. https://driveeuro.netlify.app
 */

'use strict';

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'USD'];

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
    console.error('[create-paypal-order] Token error:', err);
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
  if (!bookingReference) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'bookingReference is required' }),
    };
  }

  const siteUrl = (process.env.SITE_URL || 'https://driveeuro.netlify.app').replace(/\/$/, '');
  const returnUrl  = `${siteUrl}/?payment=success&provider=paypal&booking=${encodeURIComponent(bookingReference)}`;
  const cancelUrl  = `${siteUrl}/?payment=cancelled&provider=paypal&booking=${encodeURIComponent(bookingReference)}`;

  // ── Create PayPal order ──────────────────────────────────────────────
  let accessToken;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (err) {
    console.error('[create-paypal-order] Auth failed:', err.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Payment provider unavailable. Please try again.' }),
    };
  }

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: bookingReference,
        description: vehicleName
          ? `DriveEuro reservation: ${vehicleName}`
          : 'DriveEuro vehicle reservation fee',
        custom_id: bookingReference,
        amount: {
          currency_code: currencyCode,
          value: amountNum.toFixed(2),
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name:           'DriveEuro',
          locale:               'en-GB',
          shipping_preference:  'NO_SHIPPING',
          user_action:          'PAY_NOW',
          return_url:           returnUrl,
          cancel_url:           cancelUrl,
        },
      },
    },
  };

  let orderRes;
  try {
    orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${accessToken}`,
        'Content-Type':   'application/json',
        'PayPal-Request-Id': bookingReference, // idempotency key
        Prefer:           'return=representation',
      },
      body: JSON.stringify(orderPayload),
    });
  } catch (fetchErr) {
    console.error('[create-paypal-order] Network error:', fetchErr.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Network error communicating with payment provider.' }),
    };
  }

  if (!orderRes.ok) {
    const errText = await orderRes.text();
    console.error('[create-paypal-order] PayPal order error:', errText);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Failed to create payment order. Please try again.' }),
    };
  }

  const order = await orderRes.json();

  // Find the payer-action (approve) link
  const approvalLink = (order.links || []).find(
    (l) => l.rel === 'payer-action' || l.rel === 'approve'
  );

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId:     order.id,
      status:      order.status,
      approvalUrl: approvalLink ? approvalLink.href : null,
    }),
  };
};
