// Server-only Stripe helpers. Never import from a client component.
// STRIPE_SECRET_KEY must never be exposed to the client bundle.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key);
  return _stripe;
}

// Allowlist: only this single price ID is ever passed to Stripe Checkout.
// We refuse to read price IDs from the client request body.
export function getProPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID_PRO;
  if (!id) throw new Error("STRIPE_PRICE_ID_PRO is not set");
  return id;
}

export function getWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return s;
}

// Free tier: 3 public receipts. Private receipts require pro.
export const FREE_PUBLIC_RECEIPT_LIMIT = 3;
