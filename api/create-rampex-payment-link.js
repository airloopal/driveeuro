/**
 * /api/create-rampex-payment-link.js
 * Vercel serverless function — DriveEuroCars
 *
 * Creates a Rampex payment link for the reservation fee.
 * Enforces a minimum reservation fee of £20 (or currency equivalent)
 * server-side, independently of the frontend calculation.
 *
 * This is a defence-in-depth measure: the frontend already enforces
 * the minimum via calcPricing(), but this API route re-validates the
 * amount before sending it to Rampex, so the rule cannot be bypassed
 * by a direct API call.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    amount,
    currency = 'GBP',
    bookingReference,
    vehicleName,
    customerEmail,
    customerName,
    paymentMethod,
    trip,
  } = req.body;

  if (!amount || !bookingReference || !vehicleName || !customerEmail) {
    return res.status(400).json({
      error: 'Missing required fields: amount, bookingReference, vehicleName, customerEmail',
    });
  }

  // ── Minimum reservation fee enforcement (server-side) ────────────────
  const MIN_RESERVATION_FEE_GBP = 20;
  const FX_RATES = { GBP: 1, EUR: 1.18, USD: 1.27 };
  const rate = FX_RATES[currency] || 1;
  const minimumFee = parseFloat((MIN_RESERVATION_FEE_GBP * rate).toFixed(2));
  const safeAmount = parseFloat(Math.max(parseFloat(amount), minimumFee).toFixed(2));

  // Convert to minor units (pence / cents) for payment provider
  const amountMinorUnits = Math.round(safeAmount * 100);

  const minApplied = safeAmount > parseFloat(amount);

  // ── Build Rampex payload ──────────────────────────────────────────────
  const rampexPayload = {
    amount: amountMinorUnits,         // minor units (e.g. 2000 = £20.00)
    currency: currency.toUpperCase(),
    reference: bookingReference,
    description: `DriveEuro reservation — ${vehicleName}`,
    customerEmail,
    customerName: customerName || '',
    metadata: {
      bookingReference,
      vehicleName,
      paymentMethod: paymentMethod || 'card',
      tripPickup:    trip?.pickupLocation  || '',
      tripDropoff:   trip?.dropoffLocation || '',
      pickupDate:    trip?.pickupDate      || '',
      returnDate:    trip?.returnDate      || '',
      minimumFeeApplied: minApplied,
    },
    successUrl: `${process.env.SITE_URL || 'https://www.driveeurocars.com'}?payment=success&provider=rampex&booking=${bookingReference}`,
    cancelUrl:  `${process.env.SITE_URL || 'https://www.driveeurocars.com'}?payment=cancelled&provider=rampex`,
  };

  // ── Call Rampex API ───────────────────────────────────────────────────
  const RAMPEX_API_URL    = process.env.RAMPEX_API_URL    || 'https://api.rampex.io/v1/payment-links';
  const RAMPEX_API_KEY    = process.env.RAMPEX_API_KEY;
  const RAMPEX_ACCOUNT_ID = process.env.RAMPEX_ACCOUNT_ID;

  if (!RAMPEX_API_KEY || !RAMPEX_ACCOUNT_ID) {
    console.error('[DriveEuro] Missing RAMPEX_API_KEY or RAMPEX_ACCOUNT_ID env vars');
    return res.status(500).json({ error: 'Payment provider not configured' });
  }

  let rampexResponse;
  try {
    const apiRes = await fetch(RAMPEX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RAMPEX_API_KEY}`,
        'X-Account-Id':  RAMPEX_ACCOUNT_ID,
      },
      body: JSON.stringify(rampexPayload),
    });

    rampexResponse = await apiRes.json();

    if (!apiRes.ok) {
      console.error('[DriveEuro] Rampex API error:', rampexResponse);
      return res.status(502).json({
        error: rampexResponse?.message || 'Payment provider error',
        detail: rampexResponse,
      });
    }
  } catch (err) {
    console.error('[DriveEuro] Rampex fetch error:', err.message);
    return res.status(502).json({ error: 'Could not reach payment provider', detail: err.message });
  }

  const paymentUrl = rampexResponse?.url || rampexResponse?.paymentUrl || rampexResponse?.payment_url;
  const paymentId  = rampexResponse?.id  || rampexResponse?.paymentId  || rampexResponse?.payment_id;

  if (!paymentUrl) {
    console.error('[DriveEuro] No payment URL in Rampex response:', rampexResponse);
    return res.status(502).json({ error: 'No payment URL returned by provider', detail: rampexResponse });
  }

  return res.status(200).json({
    paymentUrl,
    paymentId,
    bookingReference,
    amountCharged:   safeAmount,
    amountMinorUnits,
    currency,
    minimumFeeApplied: minApplied,
  });
}
