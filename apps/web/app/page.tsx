/* Hallmark · macrostructure: cost-per-pr-pivot · polish: hp2-cadence-rail · genre: technical-editorial · stamp: trail-2026-05 */
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { SiteNav } from "@/components/site-nav";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Trail — What did that PR actually cost?",
  description:
    "Trail connects to Anthropic, OpenAI, Cursor, and Copilot billing and captures your local agent sessions, then attributes spend to the merged commit. Cross-vendor cost-per-PR in one number.",
  openGraph: {
    title: "Trail — What did that PR actually cost?",
    description:
      "Cross-vendor cost-per-PR for devs shipping with AI. Token-verified, per-commit attribution across Anthropic, OpenAI, Cursor, Copilot.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trail — What did that PR actually cost?",
    description:
      "Cross-vendor cost-per-PR for devs shipping with AI. Token-verified, per-commit attribution across Anthropic, OpenAI, Cursor, Copilot.",
  },
};

// Real shipped session — stands in as the cost example until a cost-pulse recap exists.
const EXAMPLE_HREF = "/u/jankarlo.faris/057smo2q";
const INSTALL = "npm i -g trail && trail record";

const primaryTools = [
  {
    name: "Claude Code",
    badge: "Local capture · ✓",
    tone: "green" as const,
    description: "JSONL session tail. Tokens recorded per turn.",
  },
  {
    name: "Codex",
    badge: "Local capture · ✓",
    tone: "green" as const,
    description: "Transcript tail. Tokens recorded per turn.",
  },
];

const partialTools = [
  {
    name: "Cursor",
    badge: "Local · partial",
    tone: "amber" as const,
    description: "SQLite prompt counts. Token data is partial.",
  },
  {
    name: "GitHub Copilot",
    badge: "Engagement only",
    tone: "amber" as const,
    description: "Org Metrics API. Counts, not dollars — no per-user token data.",
  },
  {
    name: "Hermes",
    badge: "Local capture · ✓",
    tone: "green" as const,
    description: "Direct API logging. Tokens per call.",
  },
];

const steps = [
  {
    n: "01",
    verb: "Capture",
    title: "Tail the logs your agents already write.",
    body: "The daemon tails Claude Code + Codex log files. Tokens recorded per turn.",
  },
  {
    n: "02",
    verb: "Link",
    title: "Sessions pin to the merge commit.",
    body: "When you ship, the open session pins to the merge commit via the existing receipt machinery.",
  },
  {
    n: "03",
    verb: "See",
    title: "One dashboard. Every shipped PR.",
    body: "Real $/PR for every shipped commit. Refreshed each time you ship.",
  },
];

const proofChecks = [
  { label: "Token-verified", note: "local capture pricing against per-token rates" },
  { label: "Per-commit attribution", note: "session → diff → merge" },
  { label: "No admin keys required", note: "local capture is the default path" },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    who: "The default path",
    bullets: [
      "Local capture for Claude Code + Codex",
      "30-day history",
      "Cost-per-PR on /dashboard/cost",
      "Public Recaps + share cards",
      "No admin keys required",
    ],
    cta: { label: "Install", href: "/install", featured: false, kind: "link" as const },
  },
  {
    name: "Pro",
    price: "$12",
    period: "/mo",
    who: "Solo indie devs",
    bullets: [
      "Everything in Free",
      "All 4 vendors + cloud sync",
      "Unlimited history",
      "Public + private Recaps",
      "$/PR cost-cards · Slack alerts",
    ],
    cta: { label: "Start 14-day trial", href: "/settings/connections", featured: true, kind: "link" as const },
  },
  {
    name: "Team",
    price: "$39",
    period: "/seat/mo",
    who: "AI-native teams · 2–25",
    bullets: [
      "Everything in Pro",
      "Per-dev cost attribution",
      "Team roll-up dashboard",
      "SSO-lite + audit log",
      "Dedicated Slack channel",
    ],
    cta: {
      label: "Talk to us",
      href: "mailto:jan@trail.dev?subject=Trail%20Team%20plan",
      featured: false,
      kind: "external" as const,
    },
  },
];

export default async function Home() {
  // Authenticated users land directly on /dashboard/cost — Track B treats
  // the cost ledger as the canonical home of the app. Anon users still see
  // the marketing page. BetterAuth can throw on preview-origin headers, so
  // wrap defensively.
  let sess: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sess = await auth.api.getSession({ headers: await headers() });
  } catch {
    sess = null;
  }
  if (sess?.user) redirect("/dashboard/cost");

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/" />

      <main className="flex-1">
        {/* HERO — 00 / Cost */}
        <section className="relative mx-auto max-w-6xl px-6 lg:px-10 pt-20 pb-16 grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">00</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">Cost</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-6">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
              For devs shipping with AI
            </div>

            <h1 className="font-display text-[40px] sm:text-[52px] md:text-[60px] leading-[0.98] tracking-[-0.025em] text-zinc-50 mb-7 max-w-[20ch]">
              What did that PR<br />
              actually cost?{" "}
              <span className="italic font-light text-zinc-300">Across every agent, model, and prompt.</span>
            </h1>

            <p className="text-[16px] sm:text-[17px] leading-[1.6] text-zinc-400 max-w-[52ch] mb-9">
              Install the CLI, run <span className="font-mono text-zinc-300">trail record</span>, and Trail tails the JSONL logs your AI agents already write — Claude Code, Codex — pricing each session against current per-token rates.
              {" "}Optional admin keys reconcile against your vendor invoices.
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-[14px] mb-5">
              <Link href="/install">
                <Button size="default">Install the CLI →</Button>
              </Link>
              <Link
                href="#how"
                className="text-zinc-400 hover:text-[#a7f300] transition-colors inline-flex items-center gap-1.5 px-2"
              >
                How it works
                <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="flex items-center gap-2 max-w-[460px]">
              <div className="flex-1 flex items-center h-10 px-3 rounded-md border border-zinc-800 bg-zinc-900/50 font-mono text-[12.5px] text-zinc-200 overflow-hidden">
                <span className="text-zinc-600 select-none mr-2.5 shrink-0">$</span>
                <span className="truncate">{INSTALL}</span>
              </div>
              <CopyButton value={INSTALL} label="Copy" copiedLabel="Copied" className="h-10 px-3" />
            </div>
          </div>

          {/* Hero preview — Cost card mock */}
          <div className="col-span-12 md:col-span-5">
            <Link
              href="/dashboard/cost"
              className="group block rounded-xl border border-zinc-800 hover:border-[#a7f300]/40 bg-gradient-to-b from-zinc-900/60 to-zinc-950 hover:from-zinc-900/80 transition-colors overflow-hidden shadow-[0_20px_60px_-20px_rgba(167,243,0,0.10)]"
            >
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-500">
                  trail · cost-per-pr · weekly
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">verified</span>
              </div>
              <div className="px-5 pt-5 pb-4">
                <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-zinc-600 mb-2">
                  Avg cost / shipped PR
                </div>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="font-display text-[44px] leading-none tracking-[-0.02em] text-zinc-50">$0.47</span>
                  <span className="font-mono text-[12px] text-zinc-500">/PR</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                  <div>
                    <div className="text-zinc-600 uppercase tracking-[0.16em] text-[9.5px] mb-1">Shipped</div>
                    <div className="text-zinc-200 tabular-nums">12</div>
                  </div>
                  <div>
                    <div className="text-zinc-600 uppercase tracking-[0.16em] text-[9.5px] mb-1">Total</div>
                    <div className="text-zinc-200 tabular-nums">$5.64</div>
                  </div>
                  <div>
                    <div className="text-zinc-600 uppercase tracking-[0.16em] text-[9.5px] mb-1">Top model</div>
                    <div className="text-zinc-200">sonnet-4-5</div>
                  </div>
                </div>
              </div>
              <ul className="px-5 pb-4 space-y-1.5 text-[12px] font-mono text-zinc-400">
                <li className="flex items-center justify-between gap-3">
                  <span className="truncate">fix: stripe webhook idempotency</span>
                  <span className="shrink-0 text-zinc-500 text-[10.5px]">sonnet-4-5</span>
                  <span className="shrink-0 text-zinc-300 tabular-nums w-12 text-right">$0.23</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="truncate">feat: cli device-code login</span>
                  <span className="shrink-0 text-zinc-500 text-[10.5px]">gpt-5-codex</span>
                  <span className="shrink-0 text-zinc-300 tabular-nums w-12 text-right">$0.61</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="truncate">refactor: og card flexbox</span>
                  <span className="shrink-0 text-zinc-500 text-[10.5px]">opus-4.7</span>
                  <span className="shrink-0 text-zinc-300 tabular-nums w-12 text-right">$1.84</span>
                </li>
              </ul>
              <div className="px-5 py-3 border-t border-zinc-800 grid grid-cols-3 gap-2 text-[10.5px] font-mono">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <span className="text-[#a7f300]">✓</span>
                  <span className="truncate">Local capture · zero keys</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <span className="text-[#a7f300]">✓</span>
                  <span className="truncate">Linked to commit</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <span className="text-[#a7f300]">✓</span>
                  <span className="truncate">Token-verified</span>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between text-[11px] font-mono text-zinc-500 group-hover:text-[#a7f300] transition-colors">
                <span>Open cost dashboard</span>
                <span aria-hidden>→</span>
              </div>
            </Link>
          </div>

          {/* Proof strip */}
          <div className="col-span-12 md:col-start-2 md:col-span-11 mt-2 pt-6 border-t border-zinc-900/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {proofChecks.map((c) => (
              <div key={c.label} className="flex items-start gap-2.5">
                <span className="text-[#a7f300] font-mono text-[13px] mt-0.5">✓</span>
                <div>
                  <div className="text-[13px] text-zinc-100">{c.label}</div>
                  <div className="text-[11.5px] font-mono text-zinc-500 mt-0.5">{c.note}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 01 / LOCAL CAPTURE */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>01 / Local capture</span>
            <span className="text-zinc-700">Tail the logs · no proxy</span>
          </div>
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-16 grid grid-cols-12 gap-x-6 gap-y-10">
              <div className="col-span-12 md:col-span-5">
                <h2 className="font-display text-[34px] sm:text-[42px] leading-[1.02] tracking-[-0.02em] text-zinc-50 mb-5 max-w-[18ch]">
                  One CLI for the agents you already use.
                </h2>
                <p className="text-[15px] leading-[1.65] text-zinc-400 max-w-[44ch]">
                  Trail tails the JSONL session files Claude Code and Codex already write to disk. No proxying, no API wrapping, no slowdown. Run <span className="font-mono text-zinc-300">trail record</span> once — the daemon watches for new sessions, every turn pinned to a session id.
                </p>
              </div>
              <div className="col-span-12 md:col-span-7 space-y-7">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-500 mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
                    <span>Primary — full token capture</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {primaryTools.map((t) => (
                      <div
                        key={t.name}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-[14.5px] text-zinc-100 font-medium">{t.name}</div>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#a7f300]/40 bg-[#a7f300]/10 text-[10px] font-mono uppercase tracking-[0.16em] text-[#a7f300] whitespace-nowrap">
                            {t.badge}
                          </span>
                        </div>
                        <div className="text-[12px] font-mono text-zinc-500 leading-[1.55]">{t.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-500 mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                    <span>Partial — limited telemetry</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {partialTools.map((t) => {
                      const badgeCls =
                        t.tone === "green"
                          ? "border-[#a7f300]/40 bg-[#a7f300]/10 text-[#a7f300]"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-400";
                      return (
                        <div
                          key={t.name}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="text-[14.5px] text-zinc-100 font-medium">{t.name}</div>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-[0.16em] whitespace-nowrap ${badgeCls}`}
                            >
                              {t.badge}
                            </span>
                          </div>
                          <div className="text-[12px] font-mono text-zinc-500 leading-[1.55]">{t.description}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 02 / HOW IT WORKS */}
        <section id="how" className="border-t border-zinc-900 scroll-mt-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>02 / How it works</span>
            <span className="text-zinc-700">Capture → Link → See</span>
          </div>
          {steps.map((s, i) => (
            <div key={s.n} className={`border-t border-zinc-900 ${i % 2 === 1 ? "bg-zinc-950" : ""}`}>
              <div className="mx-auto max-w-6xl px-6 lg:px-10 py-20 grid grid-cols-12 gap-x-6 gap-y-8">
                <div className="col-span-12 md:col-span-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-5">
                    <span className="text-[#a7f300]">{s.n}</span>
                    <span className="text-zinc-700"> / </span>
                    <span>{s.verb}</span>
                  </div>
                  <h3 className="font-display text-[28px] sm:text-[34px] leading-[1.05] tracking-[-0.015em] text-zinc-50 mb-5">
                    {s.title}
                  </h3>
                  <p className="text-[15px] leading-[1.65] text-zinc-400 max-w-[44ch]">{s.body}</p>
                  {s.n === "02" && (
                    <Link
                      href={EXAMPLE_HREF}
                      className="inline-flex items-center gap-1.5 mt-4 text-[12.5px] font-mono text-zinc-500 hover:text-[#a7f300] transition-colors"
                    >
                      See a linked session <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
                <div className="col-span-12 md:col-span-7 md:col-start-6">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                    <div className="px-3.5 py-2 border-b border-zinc-800 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                      <span className="ml-2 text-[11px] font-mono text-zinc-500">~/projects/client</span>
                    </div>
                    <pre className="px-5 py-5 text-[12.5px] font-mono leading-[1.75] text-zinc-300 overflow-x-auto">
{s.n === "01" && (
  <>
{`$ npm i -g trail && trail login && trail record
`}<span className="text-zinc-500">{`→ watching claude-code, codex…`}</span>{`
`}<span className="text-zinc-500">{`→ session 057smo2q started · local only`}</span>{`
`}<span className="text-zinc-500">{`→ tokens · in 14.2k · out 3.1k · cached 8.0k`}</span>
  </>
)}
{s.n === "02" && (
  <>
{`$ git push && gh pr merge --squash
`}<span className="text-zinc-500">{`→ trail linked session 057smo2q ↔ a31f9c2`}</span>{`
`}<span className="text-[#a7f300]">{`✓ pr verified · reachable from main`}</span>
  </>
)}
{s.n === "03" && (
  <>
{`$ open https://gettrail.vercel.app/dashboard/cost
`}<span className="text-zinc-500">{`  $/PR (30d)      $0.47`}</span>{`
`}<span className="text-zinc-500">{`  top model       sonnet-4-5`}</span>{`
`}<span className="text-[#a7f300]">{`✓ refreshed each time you ship`}</span>
  </>
)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Optional: BYOK reconciliation — local capture works without this */}
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-14 grid grid-cols-12 gap-x-6 gap-y-6">
              <div className="col-span-12 md:col-span-5">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-5">
                  <span className="text-zinc-500">+</span>
                  <span className="text-zinc-700"> / </span>
                  <span>Optional</span>
                </div>
                <h3 className="font-display text-[24px] sm:text-[28px] leading-[1.05] tracking-[-0.015em] text-zinc-50 mb-2 max-w-[18ch]">
                  Optional: cross-vendor reconciliation
                </h3>
              </div>
              <div className="col-span-12 md:col-span-7 md:col-start-6">
                <p className="text-[14.5px] leading-[1.7] text-zinc-400 max-w-[58ch]">
                  If you want Trail&apos;s number to match your vendor invoice exactly (cache pricing nuance, vendor-side billing windows), connect an Anthropic or OpenAI admin key on{" "}
                  <Link href="/settings/connections" className="text-zinc-200 hover:text-[#a7f300] underline-offset-4 underline decoration-zinc-700 hover:decoration-[#a7f300]/60 transition-colors">
                    /settings/connections
                  </Link>
                  . Cursor admin entry registers the CLI uploader. Copilot Metrics API gives engagement counts only — no per-user tokens.
                </p>
                <p className="mt-3 text-[12.5px] font-mono uppercase tracking-[0.16em] text-zinc-500">
                  Skippable. Local capture works without it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 03 / RECAPS — compressed */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>03 / Recaps</span>
            <span className="text-zinc-700">Five share surfaces · one engine</span>
          </div>
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-16 grid grid-cols-12 gap-x-6 gap-y-8">
              <div className="col-span-12 md:col-span-7">
                <h2 className="font-display text-[34px] sm:text-[42px] leading-[1.02] tracking-[-0.02em] text-zinc-50 mb-5 max-w-[20ch]">
                  Recaps still ship.{" "}
                  <span className="italic font-light text-zinc-300">Cost just joined the party.</span>
                </h2>
                <p className="text-[15px] leading-[1.65] text-zinc-400 max-w-[58ch] mb-6">
                  Same engine as before — now with a cost-pulse card for the PR you just merged, a Monday cost-weekly digest, and a year-end Wrapped that names your best model ROI. The build-in-public surface, with the receipts to back it up.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {["Pulse", "Weekly", "Monthly", "Project", "Wrapped"].map((tier) => (
                    <span
                      key={tier}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/50 text-[11.5px] font-mono uppercase tracking-[0.16em] text-zinc-400"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300]" />
                      {tier}
                    </span>
                  ))}
                </div>
                <Link
                  href={EXAMPLE_HREF}
                  className="inline-flex items-center gap-1.5 mt-6 text-[13px] text-zinc-400 hover:text-[#a7f300] transition-colors"
                >
                  See an example Recap <span aria-hidden>→</span>
                </Link>
              </div>
              <div className="col-span-12 md:col-span-5 md:pt-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5 text-[12.5px] font-mono leading-[1.7] text-zinc-400">
                  <div className="text-[10.5px] uppercase tracking-[0.22em] text-zinc-600 mb-3">Recap engine</div>
                  <div className="space-y-1.5">
                    <div><span className="text-zinc-600">tier</span> <span className="text-zinc-200">cost-pulse</span> <span className="text-zinc-600">·</span> <span className="text-zinc-500">per-PR cost card</span></div>
                    <div><span className="text-zinc-600">tier</span> <span className="text-zinc-200">cost-weekly</span> <span className="text-zinc-600">·</span> <span className="text-zinc-500">monday digest</span></div>
                    <div><span className="text-zinc-600">tier</span> <span className="text-zinc-200">project</span> <span className="text-zinc-600">·</span> <span className="text-zinc-500">client receipt</span></div>
                    <div><span className="text-zinc-600">tier</span> <span className="text-zinc-200">wrapped</span> <span className="text-zinc-600">·</span> <span className="text-zinc-500">drops nov 24</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 04 / PRICING */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>04 / Pricing</span>
            <span className="text-zinc-700">Stripe-only · no sales calls</span>
          </div>
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-16">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {tiers.map((t) => {
                  const featured = t.cta.featured;
                  const borderCls = featured
                    ? "border-[#a7f300]/40 shadow-[0_20px_60px_-20px_rgba(167,243,0,0.18)]"
                    : "border-zinc-800";
                  return (
                    <div
                      key={t.name}
                      className={`rounded-xl border ${borderCls} bg-gradient-to-b from-zinc-900/40 to-zinc-950 p-6 flex flex-col`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-display text-[22px] text-zinc-50">{t.name}</h3>
                        {featured && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
                            recommended
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="font-display text-[36px] leading-none tracking-[-0.02em] text-zinc-50">
                          {t.price}
                        </span>
                        <span className="font-mono text-[12px] text-zinc-500">{t.period}</span>
                      </div>
                      <p className="text-[12.5px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-5">{t.who}</p>
                      <ul className="space-y-2 text-[13.5px] text-zinc-300 mb-6 flex-1">
                        {t.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-2">
                            <span className="text-[#a7f300] font-mono text-[12px] mt-1">✓</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                      {t.cta.kind === "external" ? (
                        <a
                          href={t.cta.href}
                          className={`inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium transition-colors ${
                            featured
                              ? "bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f]"
                              : "border border-zinc-800 text-zinc-100 hover:bg-zinc-900"
                          }`}
                        >
                          {t.cta.label}
                        </a>
                      ) : (
                        <Link
                          href={t.cta.href}
                          className={`inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium transition-colors ${
                            featured
                              ? "bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f]"
                              : "border border-zinc-800 text-zinc-100 hover:bg-zinc-900"
                          }`}
                        >
                          {t.cta.label}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-8 text-center text-[13px] font-mono text-zinc-500">
                Stripe-only. No sales calls. Cancel anytime in one click.
              </p>
              <p className="mt-2 text-center text-[12px] font-mono text-zinc-600">
                <Link href="/pricing" className="hover:text-[#a7f300] transition-colors">
                  Full pricing details →
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-900 bg-gradient-to-b from-zinc-950 to-black">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-28 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-6">
              <span className="text-[#a7f300]">→</span> Your first cost-card takes one merge
            </div>
            <h2 className="font-display text-[40px] sm:text-[56px] leading-[1.0] tracking-[-0.02em] text-zinc-50 mb-8 max-w-[24ch] mx-auto">
              You already spent it. Now you can prove it shipped.
            </h2>
            <div className="flex items-center justify-center gap-2 max-w-[460px] mx-auto mb-6">
              <div className="flex-1 flex items-center h-11 px-3.5 rounded-md border border-zinc-800 bg-zinc-900/50 font-mono text-[13px] text-zinc-200 overflow-hidden">
                <span className="text-zinc-600 select-none mr-2.5 shrink-0">$</span>
                <span className="truncate">{INSTALL}</span>
              </div>
              <CopyButton value={INSTALL} label="Copy" copiedLabel="Copied" className="h-11 px-3.5" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px]">
              <Link href={EXAMPLE_HREF} className="text-zinc-400 hover:text-[#a7f300] transition-colors">
                See an example Recap →
              </Link>
              <a
                href="https://github.com/janfaris/trail"
                target="_blank"
                rel="noopener"
                className="text-zinc-400 hover:text-[#a7f300] transition-colors"
              >
                Star on GitHub →
              </a>
            </div>
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
            <Link href={EXAMPLE_HREF} className="hover:text-zinc-200 transition-colors">Example Recap</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
