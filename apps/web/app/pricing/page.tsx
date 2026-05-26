import type { Metadata } from "next";
import Link from "next/link";
import { UpgradeButton } from "./UpgradeButton";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Pricing — Trail",
  description:
    "Free forever for local single-vendor use. Pro $12/mo unlocks cross-vendor cost-per-PR. Team $39/seat/mo adds per-dev attribution and rollups.",
};

type TierKey = "free" | "pro" | "team";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  period: string;
  blurb: string;
  bullets: string[];
  featured: boolean;
};

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Anyone trying it on. Local capture, single vendor, 30-day history.",
    bullets: [
      "Single vendor BYOK",
      "30-day history",
      "Local capture via CLI + menubar",
      "Cost-per-PR for the connected vendor",
      "/dashboard/cost",
      "Public Recaps",
      "X share cards",
      "No cloud sync",
      "No team rollup",
    ],
    featured: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$12",
    period: "/mo",
    blurb: "Solo indie devs shipping with all four agents.",
    bullets: [
      "Everything in Free",
      "All 4 vendors (Anthropic, OpenAI, Cursor, Copilot)",
      "Unlimited history",
      "Cloud sync across machines",
      "Slack alerts on PRs over budget",
      "Public + private Recaps",
      "$/PR cost-cards for share",
      "Priority support",
    ],
    featured: true,
  },
  {
    key: "team",
    name: "Team",
    price: "$39",
    period: "/seat/mo",
    blurb: "AI-native teams of 2–25 who need per-dev attribution.",
    bullets: [
      "Everything in Pro",
      "Per-dev cost attribution",
      "Team rollup dashboard",
      "SSO-lite",
      "Audit log",
      "Dedicated Slack channel",
      "Admin invoicing",
    ],
    featured: false,
  },
];

const FAQ = [
  {
    q: "What's BYOK?",
    a: "Bring Your Own Key. You paste an admin-scoped API key for each vendor you connect (Anthropic, OpenAI, Cursor, Copilot). Trail encrypts it with libsodium and decrypts only inside the hourly sync job to pull your org's billing buckets. We never use your key for anything else.",
  },
  {
    q: "Do you store my API keys?",
    a: "Encrypted at rest with a key we don't keep in the database, used only for the hourly billing sync. You can revoke a connection at any time from /settings/connections and we wipe the ciphertext.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, anytime in one click. Stripe handles dunning. Your data stays available for 90 days after cancel — export it whenever you want.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/pricing" />

      <main className="flex-1">
        {/* Header */}
        <section className="mx-auto max-w-6xl px-6 lg:px-10 pt-20 pb-12 grid grid-cols-12 gap-x-6 gap-y-6">
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">$$</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">Pricing</span>
            </div>
          </div>
          <div className="col-span-12 md:col-span-11">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
              Stripe-only · cancel anytime
            </div>
            <h1 className="font-display text-[44px] sm:text-[56px] leading-[1.0] tracking-[-0.025em] text-zinc-50 mb-6 max-w-[18ch]">
              Trail Pricing
            </h1>
            <p className="text-[16px] leading-[1.65] text-zinc-300 max-w-[64ch]">
              Free forever for local single-vendor use. Paid plans unlock the cross-vendor part — the only metric that matters when you&apos;re shipping with four agents.
            </p>
          </div>
        </section>

        {/* Tiers */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-14">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {TIERS.map((t) => {
                const borderCls = t.featured
                  ? "border-[#a7f300]/40 shadow-[0_20px_60px_-20px_rgba(167,243,0,0.18)]"
                  : "border-zinc-800";
                return (
                  <div
                    key={t.key}
                    className={`rounded-xl border ${borderCls} bg-gradient-to-b from-zinc-900/40 to-zinc-950 p-6 flex flex-col`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="font-display text-[24px] text-zinc-50">{t.name}</h2>
                      {t.featured && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
                          recommended
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="font-display text-[40px] leading-none tracking-[-0.02em] text-zinc-50">
                        {t.price}
                      </span>
                      <span className="font-mono text-[12px] text-zinc-500">{t.period}</span>
                    </div>
                    <p className="text-[12.5px] leading-[1.55] text-zinc-400 mb-6 mt-2">{t.blurb}</p>

                    <ul className="space-y-2 text-[13.5px] text-zinc-300 mb-6 flex-1">
                      {t.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <span className="text-[#a7f300] font-mono text-[12px] mt-1">✓</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>

                    <div>
                      {t.key === "free" && (
                        <Link
                          href="/install"
                          className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium border border-zinc-800 text-zinc-100 hover:bg-zinc-900 transition-colors w-full"
                        >
                          Install
                        </Link>
                      )}
                      {t.key === "pro" && (
                        // UpgradeButton drives the working Stripe checkout flow.
                        // TODO: rename label once Stripe SKU is upgraded to the new $12 Pro tier.
                        <UpgradeButton label="Start 14-day trial" />
                      )}
                      {t.key === "team" && (
                        <a
                          href="mailto:jan@trail.dev?subject=Trail%20Team%20plan"
                          className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium border border-zinc-800 text-zinc-100 hover:bg-zinc-900 transition-colors w-full"
                        >
                          Talk to us
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-10 text-center text-[12.5px] font-mono text-zinc-500">
              Payments handled by Stripe. We never see your card details.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>FAQ</span>
            <span className="text-zinc-700">Three questions</span>
          </div>
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-14 grid grid-cols-12 gap-x-6 gap-y-10">
              <div className="col-span-12 md:col-span-4">
                <h2 className="font-display text-[28px] sm:text-[32px] leading-[1.05] tracking-[-0.015em] text-zinc-50 mb-3 max-w-[16ch]">
                  Common questions, short answers.
                </h2>
                <p className="text-[14px] leading-[1.6] text-zinc-400 max-w-[36ch]">
                  Anything else — jan@trail.dev. Usually replies within a day.
                </p>
              </div>
              <ol className="col-span-12 md:col-span-8 divide-y divide-zinc-900 border-y border-zinc-900">
                {FAQ.map((item, i) => (
                  <li key={item.q} className="py-6 grid grid-cols-12 gap-4">
                    <div className="col-span-2 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 pt-1">
                      <span className="text-[#a7f300]">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="col-span-10">
                      <h3 className="text-[16px] text-zinc-100 font-medium mb-2">{item.q}</h3>
                      <p className="text-[14px] leading-[1.65] text-zinc-400 max-w-[64ch]">{item.a}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-zinc-900 bg-gradient-to-b from-zinc-950 to-black">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-16 text-center">
            <p className="text-[13.5px] font-mono text-zinc-500">
              Questions?{" "}
              <a href="mailto:jan@trail.dev" className="text-zinc-200 hover:text-[#a7f300] transition-colors">
                jan@trail.dev
              </a>
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 py-8 flex flex-wrap items-center justify-between gap-y-4 text-[12px] font-mono text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="text-[#a7f300]">/</span>
            <span className="text-zinc-300">trail</span>
            <span className="text-zinc-700">·</span>
            <span>v0.1 preview</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/janfaris/trail"
              target="_blank"
              rel="noopener"
              className="hover:text-zinc-200 transition-colors"
            >
              GitHub
            </a>
            <Link href="/install" className="hover:text-zinc-200 transition-colors">Install</Link>
            <Link href="/" className="hover:text-zinc-200 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
