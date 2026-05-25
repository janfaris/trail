/* Hallmark · macrostructure: receipt-wedge · polish: hp1-vertical-rail · genre: technical-editorial · stamp: trail-2026-05 */
import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";

// Real shipped session — stands in as the example receipt until /r/[id] ships.
const EXAMPLE_HREF = "/u/jankarlo.faris/057smo2q";
const INSTALL = "git clone github.com/janfaris/trail && npm link";

const proofChecks = [
  { label: "Merged to main", note: "linked commit SHA" },
  { label: "Anonymized", note: "24+ detectors, server-gated" },
  { label: "Verified", note: "session → diff → merge" },
];

const receiptParts = [
  {
    n: "01",
    label: "Outcome",
    body: "One-line summary of what shipped. Not a transcript — the result a client can read in two seconds.",
  },
  {
    n: "02",
    label: "Linked commit",
    body: "SHA + repo + branch. The receipt only exists once the work is merged. No commit, no receipt.",
  },
  {
    n: "03",
    label: "Files touched",
    body: "The diff surface area. What changed, where, and how much — pulled straight from the merge.",
  },
  {
    n: "04",
    label: "Verification badge",
    body: "Cryptographic link between the local AI session and the commit it produced. Tamper-evident.",
  },
  {
    n: "05",
    label: "Redaction",
    body: "Keys, client names, internal URLs, high-entropy strings — stripped before the page goes public.",
  },
];

const steps = [
  {
    n: "01",
    verb: "Record",
    title: "Trail auto-captures the session.",
    body: "Tails the log files your CLIs already write — Claude Code, Codex, Cursor, Copilot, Hermes. Nothing to wire up. Nothing leaves your machine.",
  },
  {
    n: "02",
    verb: "Ship",
    title: "Commit, push, merge.",
    body: "Trail watches for the merge that closes your session. The receipt locks itself to that commit — not a screenshot, not a vibe, the SHA.",
  },
  {
    n: "03",
    verb: "Share",
    title: "trail share latest → public URL.",
    body: "Anonymizer scrubs secrets and client identifiers. You preview the redacted version. One link goes to your client. Done.",
  },
];

export default async function Home() {
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  const userRow = sessionInfo?.user
    ? await db.query.user.findFirst({ where: eq(schema.user.id, sessionInfo.user.id) })
    : null;
  const handle = userRow?.handle ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-zinc-950/70 border-b border-zinc-900/80">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="font-mono text-[14px] font-medium tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-6 text-[13px]">
            <Link href={EXAMPLE_HREF} className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Example receipt
            </Link>
            <a href="https://github.com/janfaris/trail" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              GitHub
            </a>
            {handle ? (
              <>
                <Link href={`/u/${handle}`} className="font-mono text-zinc-300 hover:text-[#a7f300] transition-colors">
                  @{handle}
                </Link>
                <SignOutButton />
              </>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative mx-auto max-w-6xl px-6 lg:px-10 pt-20 pb-16 grid grid-cols-12 gap-x-6 gap-y-10">
          {/* The rail */}
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">00</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">Receipt</span>
            </div>
          </div>

          {/* Copy column */}
          <div className="col-span-12 md:col-span-6">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
              For freelancers &amp; agencies
            </div>

            <h1 className="font-display text-[40px] sm:text-[52px] md:text-[60px] leading-[0.98] tracking-[-0.025em] text-zinc-50 mb-7 max-w-[20ch]">
              Prove the AI-assisted work<br />
              you ship.{" "}
              <span className="italic font-light text-zinc-300">Before you bill.</span>
            </h1>

            <p className="text-[16px] sm:text-[17px] leading-[1.6] text-zinc-400 max-w-[48ch] mb-9">
              For freelancers and agencies whose clients ask, <em className="italic">&ldquo;did you actually build this?&rdquo;</em>
              {" "}Trail records your AI sessions locally, then produces a verified receipt linked to the merged commit. Share the link. Done.
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-[14px] mb-5">
              <Link href={EXAMPLE_HREF}>
                <Button size="default">See an example receipt →</Button>
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

          {/* Hero preview — receipt card mock */}
          <div className="col-span-12 md:col-span-5">
            <Link
              href={EXAMPLE_HREF}
              className="group block rounded-xl border border-zinc-800 hover:border-[#a7f300]/40 bg-gradient-to-b from-zinc-900/60 to-zinc-950 hover:from-zinc-900/80 transition-colors overflow-hidden shadow-[0_20px_60px_-20px_rgba(167,243,0,0.10)]"
            >
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-500">
                  trail receipt
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">verified</span>
              </div>
              <div className="px-5 pt-5 pb-4">
                <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-zinc-600 mb-2">
                  Outcome
                </div>
                <div className="text-zinc-100 text-[16px] leading-[1.35] font-medium mb-4">
                  Stripe idempotency + retry on webhook 504s
                </div>
                <div className="flex items-center gap-2 text-[11.5px] font-mono text-zinc-400">
                  <span className="text-zinc-600">commit</span>
                  <span className="text-[#a7f300]">a31f9c2</span>
                  <span className="text-zinc-700">·</span>
                  <span>merged to main</span>
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
                <span>Open receipt</span>
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

        {/* WHAT'S IN A RECEIPT */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>What&apos;s in a receipt</span>
            <span className="text-zinc-700">Five parts</span>
          </div>
          <div className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-16 grid grid-cols-12 gap-x-6 gap-y-10">
              <div className="col-span-12 md:col-span-5">
                <h2 className="font-display text-[34px] sm:text-[42px] leading-[1.02] tracking-[-0.02em] text-zinc-50 mb-5 max-w-[16ch]">
                  A receipt is not a screenshot.
                </h2>
                <p className="text-[15px] leading-[1.65] text-zinc-400 max-w-[42ch]">
                  It&apos;s a tamper-evident page that links your AI session to the commit it produced — scrubbed, signed, and pointed at the merge. The kind of artifact a client can forward to their accountant.
                </p>
              </div>
              <ol className="col-span-12 md:col-span-7 divide-y divide-zinc-900 border-y border-zinc-900">
                {receiptParts.map((p) => (
                  <li key={p.n} className="py-5 grid grid-cols-12 gap-4">
                    <div className="col-span-2 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 pt-1">
                      <span className="text-[#a7f300]">{p.n}</span>
                    </div>
                    <div className="col-span-10">
                      <div className="text-[15px] text-zinc-100 font-medium mb-1.5">{p.label}</div>
                      <div className="text-[13.5px] leading-[1.6] text-zinc-400 max-w-[52ch]">{p.body}</div>
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
`}<span className="text-[#a7f300]">{`✓ receipt locked to merge commit`}</span>
  </>
)}
{s.n === "03" && (
  <>
{`$ trail share latest
`}<span className="text-zinc-500">{`→ scrubbing… 24 detectors · 0 leaks`}</span>{`
`}<span className="text-[#a7f300]">{`✓ https://trail.dev/r/057smo2q`}</span>{`
`}<span className="text-zinc-500">{`  send to client · auto-updates if you amend`}</span>
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
              <span className="text-[#a7f300]">→</span> Send your next invoice with a receipt
            </div>
            <h2 className="font-display text-[40px] sm:text-[56px] leading-[1.0] tracking-[-0.02em] text-zinc-50 mb-8 max-w-[22ch] mx-auto">
              One link your client can&apos;t argue with.
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
                See an example receipt →
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
            <Link href={EXAMPLE_HREF} className="hover:text-zinc-200 transition-colors">Example receipt</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
