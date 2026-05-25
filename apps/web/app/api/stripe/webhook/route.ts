// POST /api/stripe/webhook
//
// Stripe sends events here. Security:
//   - We verify the request signature using STRIPE_WEBHOOK_SECRET. Any
//     unsigned/forged request is rejected with 400.
//   - We read the RAW request body (not parsed JSON) for signature verify.
//   - We return 200 fast; heavy work is best-effort.
//
// Handled events:
//   - checkout.session.completed     -> set plan='pro', store customer+sub
//   - customer.subscription.deleted  -> set plan='free'
//   - customer.subscription.updated  -> mirror renews_at when active
//   - invoice.payment_failed         -> log only (cancel comes via sub.deleted)
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getStripe, getWebhookSecret } from "@/lib/stripe";

// Stripe requires the raw body for signature verification. In Next 16
// route handlers we get the raw bytes via req.text().
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(raw, signature, getWebhookSecret());
  } catch (err) {
    console.error("[stripe/webhook] signature verify failed:", (err as Error).message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // Log but still ACK so Stripe doesn't hammer us. We can replay from
    // the dashboard if state drifts.
    console.error("[stripe/webhook] handler failed:", event.type, (err as Error).message);
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId =
        (s.client_reference_id as string | null) ||
        (s.metadata?.userId as string | undefined);
      if (!userId) {
        console.warn("[stripe/webhook] checkout.session.completed without userId");
        return;
      }
      const customerId =
        typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
      const subscriptionId =
        typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
      await db
        .update(schema.user)
        .set({
          plan: "pro",
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
        })
        .where(eq(schema.user.id, userId));
      return;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata?.userId as string | undefined) ?? null;
      if (!userId) return;
      const active = sub.status === "active" || sub.status === "trialing";
      // current_period_end is on Stripe.Subscription; some types omit it.
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      await db
        .update(schema.user)
        .set({
          plan: active ? "pro" : "free",
          planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
        })
        .where(eq(schema.user.id, userId));
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata?.userId as string | undefined) ?? null;
      if (userId) {
        await db
          .update(schema.user)
          .set({ plan: "free", stripeSubscriptionId: null, planRenewsAt: null })
          .where(eq(schema.user.id, userId));
      } else if (sub.customer) {
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await db
          .update(schema.user)
          .set({ plan: "free", stripeSubscriptionId: null, planRenewsAt: null })
          .where(eq(schema.user.stripeCustomerId, customerId));
      }
      return;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      console.warn(
        "[stripe/webhook] invoice.payment_failed",
        inv.id,
        "customer=",
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id,
      );
      return;
    }
    default:
      // ignore everything else
      return;
  }
}
