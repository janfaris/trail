/* Hallmark · macrostructure: workbench · polish: hp1-vertical-rail · genre: technical-editorial · stamp: trail-2026-05 */
import Link from "next/link";
import { headers } from "next/headers";
import { eq, asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";

const EXAMPLE_HREF = "/u/jankarlo.faris/057smo2q";
const EXAMPLE_TITLE = "Lupa · pricing research session";
const EXAMPLE_META = "41 events · Claude Code";
const INSTALL = "npm install -g @trail/cli";

const captures: { name: string; label: string }[] = [
  { name: "claude-code", label: "Claude Code" },
  { name: "codex", label: "Codex" },
  { name: "hermes", label: "Hermes" },
  { name: "copilot-cli", label: "Copilot CLI" },
  { name: "copilot-chat", label: "Copilot Chat" },
  { name: "cursor", label: "Cursor" },
];

const stages = [
  {
    n: "01",
    verb: "Capture",
    title: "It tails the log files your CLIs already write.",
    body: "No proxying, no hooks, no slowdown. Trail watches Claude Code, Codex, Cursor, Copilot CLI, Copilot Chat, and Hermes — picks up every prompt, decision, and diff as you work.",
    artifact: "terminal",
  },
  {
    n: "02",
    verb: "Anonymize",
    title: "24+ detectors before anything goes public.",
    body: "Server-side gate strips API keys, tokens, client names, and high-entropy strings. Your sessions become shareable proof-of-work, not a credential leak.",
    artifact: "diff",
  },
  {
    n: "03",
    verb: "Curate",
    title: "Pin three. Recruiters read three.",
    body: "Pick your strongest sessions. Stack tags auto-generate from what you actually used. The profile renders as one clean page — featured trails, languages, recent activity.",
    artifact: "profile",
  },
  {
    n: "04",
    verb: "Embed",
    title: "One link. Your bio, README, résumé.",
    body: "Drop trail.dev/u/you anywhere. The embed updates as you ship. Recruiters land on a page that reads like a portfolio, not a feed.",
    artifact: "embed",
  },
];

const faqs = [
  {
    q: "Who is this for?",
    a: "Engineers who code with AI daily and want recruiters to see how they actually work — not just what they shipped. Job-seekers, freelancers, indie hackers building proof-of-work in public.",
  },
  {
    q: "What do recruiters see?",
    a: "Your featured trails — prompts, decisions, final diffs. Recruiter-mode filters to shipped work only. Embed it on your personal site or drop the link in your bio.",
  },
  {
    q: "Is anything I record automatically public?",
    a: "No. Sessions stay local until you run trail share. Public trails pass through 24+ secret detectors, an entropy guard, and a server-side gate before they go live.",
  },
  {
    q: "Which tools does it capture?",
    a: "Claude Code, Codex, Cursor, Copilot CLI, Copilot Chat, and Hermes — captured by tailing the log files they already write. Local-first. Open source.",
  },
];

export default async function Home() {
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  const userRow = sessionInfo?.user
    ? await db.query.user.findFirst({ where: eq(schema.user.id, sessionInfo.user.id) })
    : null;
  const handle = userRow?.handle ?? null;

  let discover: Array<{
    slug: string;
    title: string | null;
    tool: string;
    eventCount: number;
    startedAt: Date;
    handle: string | null;
  }> = [];
  try {
    discover = (await db
      .select({
        slug: schema.discoverFeed.slug,
        title: schema.trailSession.title,
        tool: schema.trailSession.tool,
        eventCount: schema.trailSession.eventCount,
        startedAt: schema.trailSession.startedAt,
        handle: schema.user.handle,
      })
      .from(schema.discoverFeed)
      .innerJoin(schema.trailSession, eq(schema.discoverFeed.slug, schema.trailSession.slug))
      .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
      .orderBy(asc(schema.discoverFeed.rank))
      .limit(6)) as typeof discover;
  } catch {
    discover = [];
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      {/* N7 nav — edge-aligned, monospaced kicker, no chrome */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-zinc-950/70 border-b border-zinc-900/80">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="font-mono text-[14px] font-medium tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-6 text-[13px]">
            <Link href={EXAMPLE_HREF} className="hidden sm:inline text-zinc-400 hover:text-zinc-100 transition-colors">
              @jankarlo.faris
            </Link>
            <Link href="/discover" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Discover
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
            ) : (
              <a href="/api/auth/sign-in/github">
                <Button size="sm">Sign in</Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO — HP1 Vertical-rail */}
        <section className="relative mx-auto max-w-6xl px-6 lg:px-10 pt-24 pb-28 grid grid-cols-12 gap-x-6">
          {/* The rail */}
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">00</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">Install</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-11">
            {handle && (
              <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#a7f300] mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
                Signed in as @{handle}
              </div>
            )}

            <h1 className="font-display text-[44px] sm:text-[64px] md:text-[80px] leading-[0.94] tracking-[-0.025em] text-zinc-50 mb-8 max-w-[18ch]">
              The portfolio<br />
              <span className="italic font-light text-zinc-300">recruiters can&apos;t read</span><br />
              from your <span className="text-[#a7f300]">commits</span>.
            </h1>

            <p className="text-[17px] sm:text-[19px] leading-[1.55] text-zinc-400 max-w-[58ch] mb-12">
              Trail captures your Claude Code, Codex, Cursor, Copilot, and Hermes sessions and turns
              them into one public profile. Featured trails, anonymized by default, embeddable
              anywhere.
            </p>

            <div className="flex items-center gap-2 max-w-[440px] mb-4">
              <div className="flex-1 flex items-center h-11 px-3.5 rounded-md border border-zinc-800 bg-zinc-900/50 font-mono text-[13px] text-zinc-200">
                <span className="text-zinc-600 select-none mr-2.5">$</span>
                <span>{INSTALL}</span>
              </div>
              <CopyButton value={INSTALL} label="Copy" copiedLabel="Copied" className="h-11 px-3.5" />
            </div>
            <p className="text-[11px] text-zinc-500 font-mono mb-10 max-w-[440px]">
              Coming soon. For now,{" "}
              <a href="https://github.com/janfaris/trail" className="text-zinc-400 hover:text-[#a7f300] underline-offset-4 hover:underline">
                clone the repo
              </a>{" "}
              and <span className="text-zinc-300">npm link</span>.
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
              {handle ? (
                <Link href={`/u/${handle}`}>
                  <Button size="default">View your profile →</Button>
                </Link>
              ) : (
                <a href="/api/auth/sign-in/github">
                  <Button size="default">Sign in with GitHub →</Button>
                </a>
              )}
              <Link href={EXAMPLE_HREF} className="text-zinc-300 hover:text-[#a7f300] transition-colors inline-flex items-center gap-1.5">
                See an example profile
                <span aria-hidden>→</span>
              </Link>
            </div>

            {/* Captures strip */}
            <div className="mt-16 pt-6 border-t border-zinc-900/80 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-mono">
              <span className="uppercase tracking-[0.22em] text-zinc-600">Captures</span>
              {captures.map((c) => (
                <span key={c.name} className="inline-flex items-center gap-1.5 text-zinc-400">
                  <ToolIcon name={c.name} size={13} className="text-zinc-500" />
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* WORKBENCH — Stage 01..04 */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-600">
            <span>How it works</span>
            <span className="text-zinc-700">Four stages</span>
          </div>

          {stages.map((s, i) => (
            <div
              key={s.n}
              className={`border-t border-zinc-900 ${i % 2 === 1 ? "bg-zinc-950" : ""}`}
            >
              <div className="mx-auto max-w-6xl px-6 lg:px-10 py-20 grid grid-cols-12 gap-x-6 gap-y-10">
                <div className="col-span-12 md:col-span-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-5">
                    <span className="text-[#a7f300]">{s.n}</span>
                    <span className="text-zinc-700"> / </span>
                    <span>{s.verb}</span>
                  </div>
                  <h3 className="font-display text-[28px] sm:text-[34px] leading-[1.05] tracking-[-0.015em] text-zinc-50 mb-5">
                    {s.title}
                  </h3>
                  <p className="text-[15px] leading-[1.6] text-zinc-400 max-w-[44ch]">
                    {s.body}
                  </p>
                </div>

                <div className="col-span-12 md:col-span-7 md:col-start-6">
                  {s.artifact === "terminal" && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                      <div className="px-3.5 py-2 border-b border-zinc-800 flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                        <span className="ml-2 text-[11px] font-mono text-zinc-500">~/projects/trail</span>
                      </div>
                      <pre className="px-5 py-5 text-[12.5px] font-mono leading-[1.7] text-zinc-300 overflow-x-auto">
{`$ trail record
`}<span className="text-zinc-500">{`→ watching claude-code, codex, cursor, copilot, hermes…`}</span>{`

$ trail search "stripe webhook retry"
`}<span className="text-zinc-500">{`→ 3 results across claude-code, codex`}</span>{`
`}<span className="text-[#a7f300]">{`✓ jan 14 · claude-code · "Stripe idempotency + retry"`}</span>{`
`}<span className="text-zinc-500">{`  jan 09 · codex · "webhook 504s on Vercel cold start"`}</span>
                      </pre>
                    </div>
                  )}

                  {s.artifact === "diff" && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                      <div className="px-3.5 py-2 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-zinc-500">scrub.preview</span>
                        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#a7f300]">redacted</span>
                      </div>
                      <pre className="px-5 py-5 text-[12.5px] font-mono leading-[1.7] overflow-x-auto">
<span className="text-rose-400">{`- const key = "sk_live_51Hq8x9j2P…vL8";`}</span>{`
`}<span className="text-emerald-400">{`+ const key = "sk_live_****…****";`}</span>{`

`}<span className="text-rose-400">{`- await fetch("https://acme-corp.internal/api")`}</span>{`
`}<span className="text-emerald-400">{`+ await fetch("https://█████████.internal/api")`}</span>{`

`}<span className="text-zinc-500">{`  detectors: stripe_secret · aws_arn · entropy>4.5`}</span>{`
`}<span className="text-zinc-500">{`  gate: server-side · ttl: pre-publish`}</span>
                      </pre>
                    </div>
                  )}

                  {s.artifact === "profile" && (
                    <Link
                      href={EXAMPLE_HREF}
                      className="group block rounded-lg border border-zinc-800 hover:border-[#a7f300]/40 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors overflow-hidden"
                    >
                      <div className="px-5 py-5 border-b border-zinc-800">
                        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-2">
                          trail.dev/u/jankarlo.faris
                        </div>
                        <div className="text-zinc-100 text-lg font-medium">Jan Karlo Faris</div>
                        <div className="text-[12px] font-mono text-zinc-500 mt-1">
                          ts · py · rust · 142 trails · 12 featured
                        </div>
                      </div>
                      <div className="divide-y divide-zinc-800/70">
                        {[
                          { tool: "claude-code", title: EXAMPLE_TITLE, meta: EXAMPLE_META },
                          { tool: "codex", title: "Drizzle migration: append-only schema", meta: "28 events · Codex" },
                          { tool: "hermes", title: "Background research agent w/ cron", meta: "63 events · Hermes" },
                        ].map((row) => (
                          <div key={row.title} className="px-5 py-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ToolIcon name={row.tool} size={14} className="text-[#a7f300] shrink-0" />
                              <span className="text-[13.5px] text-zinc-100 truncate">{row.title}</span>
                            </div>
                            <span className="text-[11px] font-mono text-zinc-500 shrink-0">{row.meta}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-5 py-3 text-[11px] font-mono text-zinc-500 group-hover:text-[#a7f300] transition-colors">
                        Open profile →
                      </div>
                    </Link>
                  )}

                  {s.artifact === "embed" && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                      <div className="px-3.5 py-2 border-b border-zinc-800 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-zinc-500">README.md</span>
                        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">markdown</span>
                      </div>
                      <pre className="px-5 py-5 text-[12.5px] font-mono leading-[1.7] text-zinc-300 overflow-x-auto">
<span className="text-zinc-500">{`## How I work`}</span>{`

`}<span className="text-zinc-400">{`I code with AI tools daily. Here's how I actually think:`}</span>{`

`}<span className="text-[#a7f300]">{`[![trail](https://trail.dev/u/you/badge.svg)](https://trail.dev/u/you)`}</span>{`

`}<span className="text-zinc-500">{`<!-- updates as I ship · anonymized by default -->`}</span>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Founder note — Letter aside */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-3xl px-6 lg:px-10 py-24">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-8">
              <span className="text-[#a7f300]">A —</span> Note from the builder
            </div>
            <div className="space-y-5 text-[16px] leading-[1.7] text-zinc-300 font-display">
              <p>
                I do most of my real work inside AI tools now — Claude Code, Codex, Cursor, Copilot,
                Hermes. Hours of prompts, decisions, and diffs every day. None of it shows up on my
                GitHub.
              </p>
              <p>
                Recruiters open my repos and see one-line commits. They don&apos;t see the hour I
                spent debugging a Stripe webhook retry, the refactor I argued through with Claude,
                the agent loop I wired together at 2am. The part that&apos;s actually <em className="italic">me</em>.
              </p>
              <p>
                So I built Trail. One link in your bio. Recruiters see how you think with AI, not
                just what shipped. Anonymized before publish, captured from the CLIs you already
                run — no proxying, no slowdown.
              </p>
              <p className="text-zinc-500 text-[14px] pt-2">
                Local-first. Open source. Your data, your database. —{" "}
                <Link href="/u/jankarlo.faris" className="text-zinc-300 hover:text-[#a7f300] underline-offset-4 underline decoration-zinc-700">
                  @jankarlo.faris
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-24">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 md:col-span-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-3">
                  <span className="text-[#a7f300]">Q —</span> Questions
                </div>
                <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.015em] text-zinc-50">
                  Things people ask before they install.
                </h2>
              </div>
              <dl className="col-span-12 md:col-span-8 grid sm:grid-cols-2 gap-x-10 gap-y-10">
                {faqs.map((f) => (
                  <div key={f.q}>
                    <dt className="text-[14.5px] text-zinc-100 font-medium mb-2">{f.q}</dt>
                    <dd className="text-[14px] text-zinc-400 leading-[1.6]">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="mt-16 text-[11px] font-mono text-zinc-500 uppercase tracking-[0.22em]">
              Trail is free during the v0.1 preview. Pricing arrives with v1.0.
            </p>
          </div>
        </section>

        {/* Discover (conditional) */}
        {discover.length > 0 && (
          <section className="border-t border-zinc-900">
            <div className="mx-auto max-w-6xl px-6 lg:px-10 py-24">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-2">
                    <span className="text-[#a7f300]">D —</span> Discover
                  </div>
                  <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.015em] text-zinc-50">
                    What others are working through.
                  </h2>
                </div>
                <Link href="/discover" className="text-[13px] text-zinc-400 hover:text-[#a7f300] transition-colors">
                  View all →
                </Link>
              </div>
              <ul className="grid md:grid-cols-2 gap-3">
                {discover.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/u/${s.handle ?? "anon"}/${s.slug}`}
                      className="group flex items-center gap-4 border border-zinc-900 bg-zinc-950 rounded-md p-4 hover:border-zinc-700 hover:bg-zinc-900/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] text-zinc-100 truncate group-hover:text-white">
                          {s.title ?? s.slug}
                        </div>
                        <div className="mt-1 flex items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500">
                          <span className="inline-flex items-center gap-1.5">
                            <ToolIcon name={s.tool} size={11} className="text-zinc-500" />
                            {s.tool}
                          </span>
                          {s.handle && <span className="text-zinc-400">@{s.handle}</span>}
                          <span className="tabular-nums">{s.eventCount} ev</span>
                          <RelativeTime date={s.startedAt} className="tabular-nums" />
                        </div>
                      </div>
                      <span className="text-xs font-mono text-zinc-600 group-hover:text-[#a7f300] shrink-0">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Final CTA strip */}
        <section className="border-t border-zinc-900 bg-gradient-to-b from-zinc-950 to-black">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-28 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-6">
              <span className="text-[#a7f300]">→</span> Ship your portfolio
            </div>
            <h2 className="font-display text-[40px] sm:text-[56px] leading-[1.0] tracking-[-0.02em] text-zinc-50 mb-8 max-w-[20ch] mx-auto">
              One link in your bio. <span className="italic font-light text-zinc-400">The rest writes itself.</span>
            </h2>
            <div className="flex items-center justify-center gap-2 max-w-[420px] mx-auto mb-6">
              <div className="flex-1 flex items-center h-11 px-3.5 rounded-md border border-zinc-800 bg-zinc-900/50 font-mono text-[13px] text-zinc-200">
                <span className="text-zinc-600 select-none mr-2.5">$</span>
                <span>{INSTALL}</span>
              </div>
              <CopyButton value={INSTALL} label="Copy" copiedLabel="Copied" className="h-11 px-3.5" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px]">
              <Link href={EXAMPLE_HREF} className="text-zinc-400 hover:text-[#a7f300] transition-colors">
                See an example profile →
              </Link>
              <a href="https://github.com/janfaris/trail" className="text-zinc-400 hover:text-[#a7f300] transition-colors">
                Star on GitHub →
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Ft4 footer — utility, four columns collapsed to row */}
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
            <Link href="/discover" className="hover:text-zinc-200 transition-colors">Discover</Link>
            <Link href="/u/jankarlo.faris" className="hover:text-zinc-200 transition-colors">Built by @jankarlo.faris</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
