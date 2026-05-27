/* Hallmark · macrostructure: 04-stat-led · genre: technical · theme: trail-dark-lime
 * paper: oklch(15% 0.01 280) #09090b · accent: oklch(94% 0.27 130) #a7f300 (lime · cool axis)
 * display: Fraunces (italic-serif) · body: Geist · outlier: Geist Mono (chips/labels only)
 * sections: hero-stat · breakdown · how-it-works · what-trail-captures · install · footer
 * motion: none — typography only · contrast: pass · slop test: 69/69 ✓
 * The single number $3.77 is the design. Everything else qualifies it.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CopyButton } from "@/components/copy-button";
import { SiteNav } from "@/components/site-nav";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Trail — what did that PR actually cost?",
  description:
    "Local-capture cost tracking for Claude Code and Codex. Tokens captured per turn, priced at upload, attributed to the merge commit. No admin keys.",
  openGraph: {
    title: "Trail — what did that PR actually cost?",
    description:
      "Local-capture cost tracking for Claude Code and Codex. Tokens captured per turn, priced at upload, attributed to the merge commit.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trail — what did that PR actually cost?",
    description:
      "Local-capture cost tracking for Claude Code and Codex. Tokens captured per turn, priced at upload, attributed to the merge commit.",
  },
};

// Real verified session — the number is from production, not a mockup.
const EXAMPLE_HREF = "/u/jankarlo.faris/161blsz1";
const INSTALL = "npm install -g @gettrail/cli";
const SIGNIN_HREF = "/api/auth/sign-in/github?callbackURL=/dashboard/cost";

// Real numbers from session 161blsz1 — gpt-5.5, 8h27m. Used as hero proof.
const HERO_STAT = {
  cost: "3.77",
  pr: "janfaris/trail#23",
  model: "gpt-5.5",
  inputTokens: "4,628,651",
  outputTokens: "15,813",
  cachedTokens: "4,410,112",
  duration: "8h 27m",
};

const breakdown = [
  { label: "input tokens", value: "4,628,651", price: "$23.14" },
  { label: "output tokens", value: "15,813", price: "$0.47" },
  { label: "cached input tokens (90% off)", value: "4,410,112", price: "$2.21" },
];

const steps = [
  {
    n: "01",
    title: "Install.",
    body: "One command. No admin keys, no proxy, no rewiring your agents. Trail reads the JSONL files Claude Code and Codex already write to disk.",
    code: INSTALL,
  },
  {
    n: "02",
    title: "Work normally.",
    body: "Run trail record in the background. Every assistant turn is tagged with input, output, and cached tokens — the same data your vendor uses to bill you.",
    code: "trail record &",
  },
  {
    n: "03",
    title: "Ship.",
    body: "When you merge a PR, trail attributes the session's cost to that commit. The dollar lands on /dashboard/cost. No estimation, no fanout — your tokens, your prices.",
    code: "trail share <session-id>",
  },
];

const captures = [
  { tool: "Claude Code", tier: "Primary", note: "Per-turn input/output/cache tokens via JSONL session tail." },
  { tool: "Codex", tier: "Primary", note: "Per-turn input/output/cached tokens. Model auto-detected (gpt-5.5, o1, etc)." },
  { tool: "Hermes", tier: "Primary", note: "Full local capture via session_*.json." },
  { tool: "Cursor", tier: "Partial", note: "Composer usage via SQLite (when permitted)." },
  { tool: "Copilot CLI", tier: "Partial", note: "Engagement counts. Vendor exposes no per-user token API." },
];

export default async function Home() {
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
        {/* HERO — Stat-Led. The number IS the page above the fold. */}
        <section className="mx-auto max-w-5xl px-6 lg:px-10 pt-24 md:pt-32 pb-20 md:pb-24">
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-10">
            <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;Receipts &nbsp;·&nbsp; verified &nbsp;·&nbsp; one shipped PR
          </div>

          {/* The number. Tabular figures, Fraunces, optical-size large. */}
          <div className="flex items-baseline gap-3 mb-8">
            <span className="font-display text-[28px] md:text-[40px] text-zinc-500 leading-none tabular-nums">$</span>
            <span
              className="font-display text-[120px] md:text-[200px] leading-[0.86] tracking-[-0.04em] text-zinc-50 tabular-nums"
              style={{ fontFeatureSettings: '"tnum", "ss01"' }}
            >
              {HERO_STAT.cost}
            </span>
          </div>

          {/* Qualifier — small, italic Fraunces, what the number is. */}
          <p className="italic text-zinc-300 text-[17px] md:text-[20px] leading-[1.5] max-w-[40ch] mb-12">
            …is what it cost to ship{" "}
            <Link
              href={EXAMPLE_HREF}
              className="text-zinc-50 underline decoration-[#a7f300]/60 underline-offset-4 decoration-2 hover:decoration-[#a7f300]"
            >
              {HERO_STAT.pr}
            </Link>{" "}
            with {HERO_STAT.model} over {HERO_STAT.duration}.
          </p>

          {/* Two equal CTAs. Side-by-side on desktop, stacked mobile. */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex items-center gap-0 border border-zinc-800 bg-zinc-950 rounded-md overflow-hidden">
              <code className="font-mono text-[13px] text-zinc-300 px-4 py-3 select-all whitespace-nowrap">
                <span className="text-zinc-600">$&nbsp;</span>{INSTALL}
              </code>
              <CopyButton value={INSTALL} />
            </div>
            <Link
              href={SIGNIN_HREF}
              className="inline-flex items-center justify-center px-5 py-3 rounded-md border border-[#a7f300]/40 bg-[#a7f300]/5 text-[#a7f300] text-[13px] font-mono uppercase tracking-[0.14em] hover:bg-[#a7f300]/10 hover:border-[#a7f300]/60 transition-colors"
            >
              Sign in with GitHub →
            </Link>
          </div>

          <p className="text-[12px] font-mono text-zinc-600">
            Free tier · no card · local capture works offline until you ship.
          </p>
        </section>

        {/* BREAKDOWN — the number, decomposed. Hairline rules, tabular-nums everywhere. */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-5xl px-6 lg:px-10 py-20">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-8">
              <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;Breakdown
            </div>

            <h2 className="font-display text-[34px] md:text-[44px] leading-[1.05] tracking-[-0.02em] text-zinc-50 mb-10 max-w-[20ch]">
              The number, decomposed.
            </h2>

            <div className="divide-y divide-zinc-900 border-y border-zinc-900">
              {breakdown.map((row) => (
                <div key={row.label} className="grid grid-cols-12 gap-4 py-5 items-baseline">
                  <div className="col-span-12 sm:col-span-5 font-mono text-[13px] text-zinc-400 uppercase tracking-[0.08em]">
                    {row.label}
                  </div>
                  <div className="col-span-6 sm:col-span-4 font-mono text-[14px] text-zinc-500 tabular-nums">
                    {row.value}
                  </div>
                  <div className="col-span-6 sm:col-span-3 font-display text-[24px] md:text-[28px] text-zinc-50 text-right tabular-nums">
                    {row.price}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-12 gap-4 py-6 items-baseline bg-zinc-950">
                <div className="col-span-12 sm:col-span-5 font-mono text-[11px] text-zinc-500 uppercase tracking-[0.14em]">
                  Total · session_native
                </div>
                <div className="col-span-6 sm:col-span-4 font-mono text-[12px] text-zinc-600">
                  attributed to {HERO_STAT.pr}
                </div>
                <div className="col-span-6 sm:col-span-3 font-display text-[28px] md:text-[36px] text-[#a7f300] text-right tabular-nums">
                  ${HERO_STAT.cost}
                </div>
              </div>
            </div>

            <p className="italic text-zinc-400 text-[14px] mt-8 max-w-[64ch] leading-[1.6]">
              Pricing reads from a versioned table —{" "}
              <span className="text-zinc-300">openai gpt-5.5: $5 in / $30 out / $0.50 cached per million tokens</span>.
              Multiplication, no model.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS — three steps, hairline-divided, code-led. */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-5xl px-6 lg:px-10 py-20">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-8">
              <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;How
            </div>

            <h2 className="font-display text-[34px] md:text-[44px] leading-[1.05] tracking-[-0.02em] text-zinc-50 mb-12 max-w-[18ch]">
              Three steps. No keys.
            </h2>

            <div className="space-y-12">
              {steps.map((step) => (
                <div key={step.n} className="grid grid-cols-12 gap-6 border-t border-zinc-900 pt-8">
                  <div className="col-span-12 sm:col-span-1 font-mono text-[12px] text-[#a7f300] tracking-[0.14em]">
                    {step.n}
                  </div>
                  <div className="col-span-12 sm:col-span-5">
                    <h3 className="font-display text-[22px] md:text-[26px] text-zinc-50 mb-2 leading-tight">
                      {step.title}
                    </h3>
                    <p className="text-zinc-400 text-[14px] leading-[1.6] max-w-[42ch]">
                      {step.body}
                    </p>
                  </div>
                  <div className="col-span-12 sm:col-span-6">
                    <div className="flex items-center gap-0 border border-zinc-800 rounded-md overflow-hidden bg-black">
                      <code className="font-mono text-[12px] md:text-[13px] text-zinc-300 px-3 py-2.5 select-all whitespace-nowrap overflow-x-auto flex-1">
                        <span className="text-zinc-600">$&nbsp;</span>{step.code}
                      </code>
                      <CopyButton value={step.code} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHAT TRAIL CAPTURES — honest tiers, no marketing puff. */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-5xl px-6 lg:px-10 py-20">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-8">
              <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;Coverage
            </div>

            <h2 className="font-display text-[34px] md:text-[44px] leading-[1.05] tracking-[-0.02em] text-zinc-50 mb-3 max-w-[24ch]">
              What Trail actually sees.
            </h2>
            <p className="italic text-zinc-400 text-[15px] mb-10 max-w-[60ch] leading-[1.55]">
              Honest about what the vendors expose. Copilot's metrics API has no per-user tokens — we say so instead of inventing a number.
            </p>

            <div className="divide-y divide-zinc-900 border-y border-zinc-900">
              {captures.map((row) => (
                <div key={row.tool} className="grid grid-cols-12 gap-4 py-5 items-baseline">
                  <div className="col-span-6 sm:col-span-3 font-display text-[18px] md:text-[20px] text-zinc-50">
                    {row.tool}
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <span
                      className={`inline-block font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-sm border ${
                        row.tier === "Primary"
                          ? "text-[#a7f300] border-[#a7f300]/40 bg-[#a7f300]/5"
                          : "text-amber-400 border-amber-700/60 bg-amber-900/10"
                      }`}
                    >
                      {row.tier}
                    </span>
                  </div>
                  <div className="col-span-12 sm:col-span-7 text-zinc-400 text-[14px] leading-[1.55]">
                    {row.note}
                  </div>
                </div>
              ))}
            </div>

            <p className="italic text-zinc-400 text-[14px] mt-8 max-w-[62ch] leading-[1.55]">
              Optional · BYOK admin keys (Anthropic, OpenAI) add cross-vendor reconciliation when you outgrow local capture. Encrypted with libsodium, revocable in one click.
            </p>
          </div>
        </section>

        {/* INSTALL — repeat the primary action at the bottom, single CTA. */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-5xl px-6 lg:px-10 py-24 text-center">
            <p className="italic text-zinc-300 text-[18px] md:text-[22px] mb-8 max-w-[46ch] mx-auto leading-[1.45]">
              See where every dollar of your AI bill went, by the PR it shipped in.
            </p>
            <div className="inline-flex items-center gap-0 border border-zinc-800 bg-black rounded-md overflow-hidden">
              <code className="font-mono text-[14px] text-zinc-200 px-5 py-3.5 select-all whitespace-nowrap">
                <span className="text-zinc-600">$&nbsp;</span>{INSTALL}
              </code>
              <CopyButton value={INSTALL} />
            </div>
            <div className="mt-5 text-[12px] font-mono text-zinc-600">
              or{" "}
              <Link href={SIGNIN_HREF} className="text-[#a7f300] hover:underline">
                sign in with GitHub →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER — Ft7 one-line minimal. Wordmark + handle + verifiable proof links. */}
      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-5xl px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="font-display text-[15px] text-zinc-400">
            <Link href="/" className="text-zinc-200 hover:text-zinc-50">Trail</Link>
            <span className="text-zinc-700 mx-3">·</span>
            <span className="font-mono text-[12px] text-zinc-500">@gettrail/cli on npm</span>
          </div>
          <div className="flex items-center gap-5 text-[12px] font-mono text-zinc-500">
            <a href="https://github.com/janfaris/trail" className="hover:text-zinc-200">github</a>
            <a href="https://www.npmjs.com/package/@gettrail/cli" className="hover:text-zinc-200">npm</a>
            <Link href="/pricing" className="hover:text-zinc-200">pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
