// POST /api/stripe/checkout
//
// Creates a Stripe Checkout Session for the $9/mo Pro subscription.
// Security:
//   - User must be authenticated.
//   - We NEVER read price IDs from the request body — server is the only
//     source of truth via STRIPE_PRICE_ID_PRO.
//   - STRIPE_SECRET_KEY stays server-side (this is a server route).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getStripe, getProPriceId } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  const priceId = getProPriceId(); // allowlisted; never client-supplied
  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

  // Reuse existing Stripe customer if we have one stored.
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
    columns: { stripeCustomerId: true, email: true },
  });

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?upgraded=1`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
      customer: userRow?.stripeCustomerId || undefined,
      customer_email: userRow?.stripeCustomerId ? undefined : userRow?.email,
      client_reference_id: session.user.id,
      metadata: { userId: session.user.id },
      subscription_data: { metadata: { userId: session.user.id } },
      allow_promotion_codes: true,
    });
    return NextResponse.json({ sessionUrl: checkout.url, sessionId: checkout.id });
  } catch (err) {
    console.error("[stripe/checkout] failed:", (err as Error).message);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
