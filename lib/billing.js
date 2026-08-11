// lib/billing.js — Paystack Transactions wrapper for tenant activation.
//
// Our price (lib/pricing.js) is computed in USD cents ($0.50/user, $100 floor).
// Paystack's `amount` is always the smallest unit of whatever currency you pass
// (cents for USD/ZAR/GHS, kobo for NGN) — so as long as PAYSTACK_CURRENCY is USD
// (the default), our cents value is already exactly what Paystack expects with
// no conversion. If you switch PAYSTACK_CURRENCY to something else, the pricing
// model in lib/pricing.js needs to change too, or you'll charge the wrong amount
// — this file does NOT do currency conversion.
const PAYSTACK_API = 'https://api.paystack.co';
const CURRENCY = process.env.PAYSTACK_CURRENCY || 'USD';

export const isConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY);

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(PAYSTACK_API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.status === false) throw new Error(json.message || `Paystack ${path} → ${res.status}`);
  return json.data;
}

// A recurring Plan is created per activation so the exact usage-based price
// (which varies per tenant) becomes a real monthly subscription rather than a
// one-off charge — Paystack auto-bills the plan's amount every interval once
// the first transaction on it succeeds.
async function ensurePlan({ domain, priceCents }) {
  const plan = await call('/plan', {
    method: 'POST',
    body: { name: `Sentinel — ${domain}`, amount: priceCents, interval: 'monthly', currency: CURRENCY },
  });
  return plan.plan_code;
}

export async function startCheckout({ domain, name, email, priceCents, baseUrl }) {
  const planCode = await ensurePlan({ domain, priceCents: priceCents });
  const tx = await call('/transaction/initialize', {
    method: 'POST',
    body: {
      email: email || `billing+${domain}@example.invalid`,
      amount: priceCents,
      currency: CURRENCY,
      plan: planCode,
      callback_url: `${baseUrl}/activate/success?domain=${encodeURIComponent(domain)}`,
      metadata: { domain, name },
    },
  });
  return tx; // { authorization_url, access_code, reference }
}

export async function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key,
// sent in the `x-paystack-signature` header. Callers must pass the RAW
// (unparsed) body — signatures are computed over exact bytes.
export async function verifyWebhookSignature(rawBody, signature) {
  const { createHmac } = await import('node:crypto');
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '').update(rawBody).digest('hex');
  return Boolean(signature) && expected === signature;
}
