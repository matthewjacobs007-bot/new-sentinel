// lib/billing.js — Stripe Checkout wrapper for tenant activation.
// Deliberately thin: we compute our own price (lib/pricing.js) and hand Stripe
// a single flat recurring line item per tenant — no reliance on Stripe's
// native per-seat quantity pricing, since our $100/mo floor doesn't map to it.
import Stripe from 'stripe';

let stripe = null;
export const isConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
function client() {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

export async function createCheckoutSession({ domain, name, priceCents, baseUrl }) {
  const session = await client().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Sentinel — ${name || domain}` },
        unit_amount: priceCents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    metadata: { domain },
    success_url: `${baseUrl}/activate/success?domain=${encodeURIComponent(domain)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/activate?domain=${encodeURIComponent(domain)}&cancelled=1`,
  });
  return session;
}

export async function retrieveSession(sessionId) {
  return client().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
}

// Verifies the Stripe signature and parses the event. Callers must pass the
// RAW (unparsed) request body — Stripe signatures are computed over exact bytes.
export function constructWebhookEvent(rawBody, signature, webhookSecret) {
  return client().webhooks.constructEvent(rawBody, signature, webhookSecret);
}
