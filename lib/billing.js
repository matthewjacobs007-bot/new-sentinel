// lib/billing.js — Paystack Transactions wrapper for tenant activation.
//
// Price (lib/pricing.js) is always computed and DISPLAYED in USD cents
// ($0.50/user, $100 floor) — that never changes. But Paystack only accepts
// whatever currency your account actually settles in (many accounts, e.g.
// South African ones, don't support USD at all), so when PAYSTACK_CURRENCY
// isn't USD, we convert the USD amount to that currency at the current FX
// rate (lib/fx.js) right before creating the Plan/Transaction. The client
// always sees a $ figure; the card is charged in the account's real currency.
import { usdCentsTo } from './fx.js';

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
// the first transaction on it succeeds. `billingAmount` is already in
// CURRENCY's cents (converted from USD by the caller, if needed).
async function ensurePlan({ domain, billingAmount }) {
  const plan = await call('/plan', {
    method: 'POST',
    body: { name: `Sentinel — ${domain}`, amount: billingAmount, interval: 'monthly', currency: CURRENCY },
  });
  return plan.plan_code;
}

export async function startCheckout({ domain, name, email, priceCents, baseUrl }) {
  const billingAmount = await usdCentsTo(priceCents, CURRENCY);
  const planCode = await ensurePlan({ domain, billingAmount });
  const tx = await call('/transaction/initialize', {
    method: 'POST',
    body: {
      // Real client sign-ins always have a real Google email; this fallback only fires
      // for the rare MSP-triggered-checkout edge case with no email on the session.
      // Paystack's validator rejects reserved TLDs like .invalid, so use a plain .com.
      email: email || `billing@${domain.replace(/[^a-z0-9.-]/gi, '') || 'sentinel-tenant'}.no-reply.com`,
      amount: billingAmount,
      currency: CURRENCY,
      plan: planCode,
      callback_url: `${baseUrl}/activate/success?domain=${encodeURIComponent(domain)}`,
      metadata: { domain, name, usdPriceCents: priceCents },
    },
  });
  return tx; // { authorization_url, access_code, reference }
}

export async function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// Cancelling a Paystack subscription requires BOTH its code and its email_token
// (Paystack's model — the token proves the request is tied to the actual
// subscription, not just anyone who knows the code). Both come from the
// `subscription.create` webhook event, not from the initial charge.success one.
export async function disableSubscription(code, token) {
  return call('/subscription/disable', { method: 'POST', body: { code, token } });
}

// Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key,
// sent in the `x-paystack-signature` header. Callers must pass the RAW
// (unparsed) body — signatures are computed over exact bytes.
export async function verifyWebhookSignature(rawBody, signature) {
  const { createHmac } = await import('node:crypto');
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '').update(rawBody).digest('hex');
  return Boolean(signature) && expected === signature;
}
