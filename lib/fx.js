// lib/fx.js — USD -> settlement-currency conversion for billing.
// Pricing (lib/pricing.js) is always denominated and DISPLAYED in USD; this only
// converts the amount actually charged when the payment processor's account
// currency isn't USD (e.g. a ZAR-settling Paystack account). Rates come from
// the European Central Bank's daily reference rate via frankfurter.app — free,
// no API key, no vendor lock-in. Cached in-memory for an hour so checkout
// doesn't do a network round-trip on every click.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache = { rate: null, currency: null, at: 0 };

// Conservative fallback if the FX API is unreachable, so a network blip
// doesn't hard-fail checkout. Update this occasionally — it's a safety net,
// not the source of truth.
const FALLBACK_USD_RATES = { ZAR: 18.5 };

export async function usdRate(currency) {
  if (currency === 'USD') return 1;
  if (cache.currency === currency && Date.now() - cache.at < CACHE_TTL_MS) return cache.rate;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(currency)}`);
    const json = await res.json();
    const rate = json.rates?.[currency];
    if (!rate) throw new Error(`No USD->${currency} rate returned`);
    cache = { rate, currency, at: Date.now() };
    return rate;
  } catch (e) {
    if (FALLBACK_USD_RATES[currency]) return FALLBACK_USD_RATES[currency];
    throw e;
  }
}

// Converts a USD-cents amount into cents of `currency` at the current rate.
export async function usdCentsTo(usdCents, currency) {
  const rate = await usdRate(currency);
  return Math.round(usdCents * rate);
}
