// lib/pricing.js — usage-based pricing for tenant activation.
// $0.50 per active user per month, with a $100/month minimum. All amounts in
// cents internally (Stripe convention) to avoid float rounding on money.
export const PRICE_PER_USER_CENTS = 50;      // $0.50
export const MIN_PRICE_CENTS = 10000;        // $100.00

export function computeMonthlyPriceCents(userCount) {
  const n = Math.max(0, Number(userCount) || 0);
  return Math.max(n * PRICE_PER_USER_CENTS, MIN_PRICE_CENTS);
}

export function formatUsd(cents) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Human-readable breakdown for the payment-wall page, e.g.:
//   "42 users × $0.50/mo = $21.00 — the $100.00/mo minimum applies"
//   "312 users × $0.50/mo = $156.00/mo"
export function priceBreakdown(userCount) {
  const n = Math.max(0, Number(userCount) || 0);
  const raw = n * PRICE_PER_USER_CENTS;
  const price = Math.max(raw, MIN_PRICE_CENTS);
  const minimumApplied = raw < MIN_PRICE_CENTS;
  return {
    userCount: n, priceCents: price, minimumApplied,
    summary: minimumApplied
      ? `${n} user${n === 1 ? '' : 's'} × ${formatUsd(PRICE_PER_USER_CENTS)}/mo = ${formatUsd(raw)} — the ${formatUsd(MIN_PRICE_CENTS)}/mo minimum applies`
      : `${n} user${n === 1 ? '' : 's'} × ${formatUsd(PRICE_PER_USER_CENTS)}/mo = ${formatUsd(price)}/mo`,
  };
}
