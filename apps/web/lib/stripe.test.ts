import { beforeEach, describe, expect, test, vi } from "vitest";

// Tests for Task 7 paywall + Stripe wiring.
//
// We exercise the pure server-side guarantees here:
//   1. STRIPE_PRICE_ID_PRO allowlist — server-side price ID, never client.
//   2. Webhook signature verification rejects forged requests.
//   3. checkPaywall enforces the 3-public-receipt cap for free users.

describe("stripe lib — server-only secrets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("getProPriceId throws if env unset (allowlist enforced)", async () => {
    const prev = process.env.STRIPE_PRICE_ID_PRO;
    Reflect.deleteProperty(process.env, "STRIPE_PRICE_ID_PRO");
    const { getProPriceId } = await import("./stripe");
    expect(() => getProPriceId()).toThrow(/STRIPE_PRICE_ID_PRO/);
    if (prev) process.env.STRIPE_PRICE_ID_PRO = prev;
  });

  test("getProPriceId returns env value (and only that value)", async () => {
    process.env.STRIPE_PRICE_ID_PRO = "price_test_123";
    const { getProPriceId } = await import("./stripe");
    expect(getProPriceId()).toBe("price_test_123");
  });

  test("getStripe throws if STRIPE_SECRET_KEY missing", async () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    Reflect.deleteProperty(process.env, "STRIPE_SECRET_KEY");
    const { getStripe } = await import("./stripe");
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
    if (prev) process.env.STRIPE_SECRET_KEY = prev;
  });
});

describe("stripe webhook — signature verification", () => {
  test("constructEvent throws on bad signature", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
    const { getStripe } = await import("./stripe");
    const stripe = getStripe();
    expect(() => stripe.webhooks.constructEvent("{}", "bogus", "whsec_test_dummy")).toThrow();
  });
});

describe("paywall — free tier counter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadWithMockDb(mock: {
    plan: string;
    publicCount: number;
  }) {
    vi.doMock("@/db/client", () => ({
      db: {
        query: {
          user: {
            findFirst: vi.fn().mockResolvedValue({ plan: mock.plan }),
          },
        },
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ value: mock.publicCount }]),
          }),
        }),
      },
      schema: {
        user: { id: "id", plan: "plan" },
        trailSession: {
          userId: "userId",
          visibility: "visibility",
          sharedAt: "sharedAt",
          receiptGeneratedAt: "receiptGeneratedAt",
        },
      },
    }));
    return await import("./paywall");
  }

  test("free user with <3 public receipts is allowed", async () => {
    const { checkPaywall } = await loadWithMockDb({ plan: "free", publicCount: 1 });
    const r = await checkPaywall("u1", { visibility: "public" });
    expect(r.allowed).toBe(true);
  });

  test("free user at 3 public receipts is blocked", async () => {
    const { checkPaywall } = await loadWithMockDb({ plan: "free", publicCount: 3 });
    const r = await checkPaywall("u1", { visibility: "public" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toBe("paywall_public_limit");
      expect(r.limit).toBe(3);
    }
  });

  test("free user cannot create private receipts", async () => {
    const { checkPaywall } = await loadWithMockDb({ plan: "free", publicCount: 0 });
    const r = await checkPaywall("u1", { visibility: "private" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("paywall_private_pro_only");
  });

  test("pro user is unlimited (public and private)", async () => {
    const { checkPaywall } = await loadWithMockDb({ plan: "pro", publicCount: 999 });
    expect((await checkPaywall("u1", { visibility: "public" })).allowed).toBe(true);
    expect((await checkPaywall("u1", { visibility: "private" })).allowed).toBe(true);
  });
});
