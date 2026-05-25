/* Hallmark · macrostructure: recaps-wedge · polish: hp2-cadence-rail · genre: technical-editorial · stamp: trail-2026-05 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { SiteNav } from "@/components/site-nav";

// Real shipped session — stands in as the example Recap until /r/[id] ships.
const EXAMPLE_HREF = "/u/jankarlo.faris/057smo2q";
const INSTALL = "git clone github.com/janfaris/trail && npm link";

const cadences = [
  {
    n: "01",
    tier: "Pulse",
    when: "After every shipped session",
    body: "A single share-card for the work you just merged. One stat, one outcome, one link. Replaces the build-in-public thread you keep meaning to write.",
  },
  {
    n: "02",
    tier: "Weekly",
    when: "Mondays, auto-generated",
    body: "A digest of what you shipped, which models you reached for, which stacks you fought with. The Monday-morning ritual for AI-assisted devs.",
  },
  {
    n: "03",
    tier: "Monthly",
    when: "1st of the month",
    body: "A themed recap — a month in code, distilled. Long enough to send to a newsletter, short enough to read in two minutes.",
  },
  {
    n: "04",
    tier: "Project",
    when: "When the project ships",
    body: "The receipt. A verified, redacted page locked to the merge commit. The link you send a client when they ask did you actually build this?",
  },
  {
    n: "05",
    tier: "Wrapped",
    when: "Annual · drops Nov 24",
    body: "A year-in-review story. Your top models, top stacks, top fights, top ships. Designed to share, dated to create urgency, free forever.",
  },
];

const steps = [
  {
    n: "01",
    verb: "Capture",
    title: "Trail tails the tools you already use.",
    body: "Claude Code, Codex, Cursor, Copilot, Hermes — Trail watches the logs they already write. Nothing to wire up. Nothing leaves your machine until you share it.",
  },
  {
    n: "02",
    verb: "Link",
    title: "Sessions lock to merge commits.",
    body: "When the work ships, Trail pins the session to the SHA. Not a screenshot, not a vibe — the commit. Everything you share is anchored to something git can verify.",
  },
  {
    n: "03",
    verb: "Recap",
    title: "Pick a cadence. Get a link.",
    body: "Pulse for the one you just shipped. Weekly on Mondays. Project for the client. Wrapped for the year. Same engine, five share surfaces, all redacted and ready.",
  },
];

const proofChecks = [
  { label: "Linked to commit", note: "SHA, repo, branch" },
  { label: "Anonymized", note: "24+ detectors, server-gated" },
  { label: "Verified", note: "session → diff → merge" },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/" />

      <main className="flex-1">
        {/* HERO */}
        <section className="relative mx-auto max-w-6xl px-6 lg:px-10 pt-20 pb-16 grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">00</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">Recaps</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-6">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
              For devs who ship with AI
            </div>

            <h1 className="font-display text-[40px] sm:text-[52px] md:text-[60px] leading-[0.98] tracking-[-0.025em] text-zinc-50 mb-7 max-w-[20ch]">
              The public log of what<br />
              you shipped.{" "}
              <span className="italic font-light text-zinc-300">With AI in the loop.</span>
            </h1>

            <p className="text-[16px] sm:text-[17px] leading-[1.6] text-zinc-400 max-w-[48ch] mb-9">
              Trail captures your AI coding sessions locally and turns them into <em className="italic">Recaps</em> — share-ready summaries linked to the commits they produced.
              {" "}Pulse for the one you just merged. Weekly on Mondays. Project for the client. Wrapped for the year.
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-[14px] mb-5">
              <Link href={EXAMPLE_HREF}>
                <Button size="default">See an example Recap →</Button>
              </Link>
              <Link
                href="/install"
                className="text-zinc-400 hover:text-[#a7f300] transition-colors inline-flex items-center gap-1.5 px-2"
              >
                Install instructions
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

          {/* Hero preview — Recap card mock */}
          <div className="col-span-12 md:col-span-5">
            <Link
              href={EXAMPLE_HREF}
              className="group block rounded-xl border border-zinc-800 hover:border-[#a7f300]/40 bg-gradient-to-b from-zinc-900/60 to-zinc-950 hover:from-zinc-900/80 transition-colors overflow-hidden shadow-[0_20px_60px_-20px_rgba(167,243,0,0.10)]"
            >
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-500">
                  trail recap · pulse
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">verified</span>
              </div>
              <div className="px-5 pt-5 pb-4">
                <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-zinc-600 mb-2">
                  Shipped
                </div>
                <div className="text-zinc-100 text-[16px] leading-[1.35] font-medium mb-4">
                  Stripe idempotency + retry on webhook 504s
                </div>
                <div className="flex items-center gap-2 text-[11.5px] font-mono text-zinc-400">
                  <span className="text-zinc-600">commit</span>
                  <span className="text-[#a7f300]">a31f9c2</span>
                  <span className="text-zinc-700">·</span>
                  <span>claude-opus-4.7 · cursor</span>
                </div>
              </div>
              <ul className="px-5 pb-4 space-y-1.5 text-[12px] font-mono text-zinc-400">
                <li className="flex items-center justify-between">
                  <span className="truncate">apps/api/webhooks/stripe.ts</span>
                  <span className="text-zinc-600 tabular-nums">+47 −12</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="truncate">apps/api/lib/idempotency.ts</span>
                  <span className="text-zinc-600 tabular-nums">+38 −0</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="truncate">apps/api/webhooks/stripe.test.ts</span>
                  <span className="text-zinc-600 tabular-nums">+91 −4</span>
                </li>
              </ul>
              <div className="px-5 py-3 border-t border-zinc-800 grid grid-cols-3 gap-2 text-[10.5px] font-mono">
                {proofChecks.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 text-zinc-400">
                    <span className="text-[#a7f300]">✓</span>
                    <span className="truncate">{c.label}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between text-[11px] font-mono text-zinc-500 group-hover:text-[#a7f300] transition-colors">
                <span>Open Recap</span>
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

        {/* FIVE CADENCES */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>Five Recaps, one engine</span>
            <span className="text-zinc-700">Pulse → Wrapped</span>
          </div>
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-16 grid grid-cols-12 gap-x-6 gap-y-10">
              <div className="col-span-12 md:col-span-5">
                <h2 className="font-display text-[34px] sm:text-[42px] leading-[1.02] tracking-[-0.02em] text-zinc-50 mb-5 max-w-[16ch]">
                  Same engine. Five share surfaces.
                </h2>
                <p className="text-[15px] leading-[1.65] text-zinc-400 max-w-[42ch]">
                  Trail captures once and recaps everywhere. The Pulse you share on X is the same data your Weekly digest summarizes, the same data your Project receipt locks to a commit, the same data your annual Wrapped pulls from. Captured once. Replayed five ways.
                </p>
              </div>
              <ol className="col-span-12 md:col-span-7 divide-y divide-zinc-900 border-y border-zinc-900">
                {cadences.map((c) => (
                  <li key={c.n} className="py-5 grid grid-cols-12 gap-4">
                    <div className="col-span-2 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 pt-1">
                      <span className="text-[#a7f300]">{c.n}</span>
                    </div>
                    <div className="col-span-10">
                      <div className="flex items-baseline gap-3 mb-1.5">
                        <div className="text-[15px] text-zinc-100 font-medium">{c.tier}</div>
                        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500">{c.when}</div>
                      </div>
                      <div className="text-[13.5px] leading-[1.6] text-zinc-400 max-w-[58ch]">{c.body}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>How it works</span>
            <span className="text-zinc-700">Three steps</span>
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
{`$ trail record
`}<span className="text-zinc-500">{`→ watching claude-code, codex, cursor, copilot, hermes…`}</span>{`
`}<span className="text-zinc-500">{`→ session 057smo2q started · local only`}</span>
  </>
)}
{s.n === "02" && (
  <>
{`$ git commit -m "fix: stripe webhook idempotency"
$ git push && gh pr merge --squash
`}<span className="text-zinc-500">{`→ trail linked session 057smo2q ↔ a31f9c2`}</span>{`
`}<span className="text-[#a7f300]">{`✓ pulse recap ready`}</span>
  </>
)}
{s.n === "03" && (
  <>
{`$ trail recap pulse latest
`}<span className="text-zinc-500">{`→ scrubbing… 24 detectors · 0 leaks`}</span>{`
`}<span className="text-[#a7f300]">{`✓ https://trail.dev/r/057smo2q`}</span>{`
`}<span className="text-zinc-500">{`  $ trail recap weekly   → mondays, auto`}</span>{`
`}<span className="text-zinc-500">{`  $ trail recap project  → the client receipt`}</span>{`
`}<span className="text-zinc-500">{`  $ trail recap wrapped  → drops nov 24`}</span>
  </>
)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-900 bg-gradient-to-b from-zinc-950 to-black">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-28 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-6">
              <span className="text-[#a7f300]">→</span> Your first Recap takes one merge
            </div>
            <h2 className="font-display text-[40px] sm:text-[56px] leading-[1.0] tracking-[-0.02em] text-zinc-50 mb-8 max-w-[22ch] mx-auto">
              Show what you shipped. Not what you typed.
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
              <a href="https://github.com/janfaris/trail" className="text-zinc-400 hover:text-[#a7f300] transition-colors">
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
            <a href="https://github.com/janfaris/trail" className="hover:text-zinc-200 transition-colors">GitHub</a>
            <Link href="/install" className="hover:text-zinc-200 transition-colors">Install</Link>
            <Link href={EXAMPLE_HREF} className="hover:text-zinc-200 transition-colors">Example Recap</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
