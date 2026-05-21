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

const features = [
  {
    title: "GitHub shows the artifact. Trail shows the artisan.",
    body: "Commits show what shipped. Trail shows the reasoning thread that produced it — the prompts, the dead-ends, the fixes. The part recruiters never see.",
  },
  {
    title: "One link in your bio. Embeds anywhere.",
    body: "Drop trail.dev/u/you into your personal site, GitHub README, or résumé. Profiles render as a clean embed — three featured sessions, your stack, your style.",
  },
  {
    title: "Anonymized by default.",
    body: "24+ secret detectors, entropy guard, server-side gate before anything goes public. Your portfolio is shareable without leaking API keys or client code.",
  },
];

const captures: { name: string; label: string }[] = [
  { name: "claude-code", label: "Claude Code" },
  { name: "codex", label: "Codex" },
  { name: "hermes", label: "Hermes" },
  { name: "copilot-cli", label: "Copilot CLI" },
  { name: "copilot-chat", label: "Copilot Chat" },
  { name: "cursor", label: "Cursor" },
];

const faqs = [
  {
    q: "Who is this for?",
    a: "Engineers who code with AI tools daily and want to show recruiters how they actually work — not just what they shipped. Job-seekers, freelancers, indie hackers building proof-of-work in public.",
  },
  {
    q: "What do recruiters actually see?",
    a: "Your featured sessions — prompts, decisions, and final diffs. A recruiter-mode view filters to shipped trails only. Embed it on your personal site or drop the link in your bio.",
  },
  {
    q: "Is anything I record automatically public?",
    a: "No. Sessions stay on your machine until you run trail share. Public sessions pass through 24+ secret detectors, an entropy guard, and a server-side gate before they go live.",
  },
  {
    q: "Which AI tools does it capture?",
    a: "Claude Code, Codex, Cursor, Copilot CLI, Copilot Chat, and Hermes — captured by tailing the log files they already write. No proxying, no hooks, no slowdown.",
  },
];

const INSTALL = "npm install -g @trail/cli";

export default async function Home() {
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  const userRow = sessionInfo?.user
    ? await db.query.user.findFirst({ where: eq(schema.user.id, sessionInfo.user.id) })
    : null;
  const handle = userRow?.handle ?? null;

  // Top-6 discover feed for the homepage section. Hides itself if empty (e.g.
  // before the first cron run or if the table doesn't exist yet).
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
      .innerJoin(
        schema.trailSession,
        eq(schema.discoverFeed.slug, schema.trailSession.slug),
      )
      .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
      .orderBy(asc(schema.discoverFeed.rank))
      .limit(6)) as typeof discover;
  } catch {
    discover = [];
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/discover"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Discover
            </Link>
            <Link
              href="/search"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Search
            </Link>
            <a
              href="https://github.com/janfaris/trail"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              GitHub
            </a>
            {handle ? (
              <>
                <Link
                  href={`/u/${handle}`}
                  className="font-mono text-zinc-300 hover:text-[#a7f300] transition-colors"
                >
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
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
          {handle && (
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#a7f300] mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
              Signed in as @{handle}
            </div>
          )}
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
            v0.1 · open source
          </div>
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight leading-[1.02] text-zinc-50 mb-6 max-w-3xl">
            Your AI coding{" "}
            <span className="text-[#a7f300]">portfolio</span>.
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed mb-10">
            Recruiters see your commits. Trail shows how you actually think — every Claude Code,
            Codex, Cursor, Copilot, and Hermes session, curated as one link you drop in your bio.
          </p>

          <div className="flex items-center gap-2 max-w-md mb-3">
            <div className="flex-1 flex items-center h-11 px-3 rounded-md border border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200">
              <span className="text-zinc-600 select-none mr-2">$</span>
              <span>{INSTALL}</span>
            </div>
            <CopyButton value={INSTALL} label="Copy" copiedLabel="Copied" className="h-11 px-3" />
          </div>
          <p className="text-xs text-zinc-500 font-mono mb-8 max-w-md">
            Coming soon. Until then,{" "}
            <a
              href="https://github.com/janfaris/trail"
              className="text-zinc-400 hover:text-[#a7f300] underline-offset-4 hover:underline"
            >
              clone the repo
            </a>{" "}
            and <span className="text-zinc-300">npm link</span>.
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {handle ? (
              <Link href={`/u/${handle}`}>
                <Button size="default">View your profile</Button>
              </Link>
            ) : (
              <a href="/api/auth/sign-in/github">
                <Button size="default">Sign in with GitHub</Button>
              </a>
            )}
            <Link
              href="/install"
              className="text-zinc-400 hover:text-[#a7f300] transition-colors inline-flex items-center gap-1.5"
            >
              Install
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href={EXAMPLE_HREF}
              className="text-zinc-400 hover:text-[#a7f300] transition-colors inline-flex items-center gap-1.5"
            >
              View example session
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {/* Captures strip */}
          <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono text-zinc-500">
            <span className="uppercase tracking-[0.16em] text-zinc-600">Captures</span>
            {captures.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1.5">
                <ToolIcon name={c.name} size={14} className="text-zinc-400" />
                <span className="text-zinc-400">{c.label}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Features + sample terminal */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-900">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-2xl font-medium tracking-tight text-zinc-50 mb-2">
                The portfolio recruiters can&apos;t get from GitHub
              </h2>
              <p className="text-zinc-500 mb-8 leading-relaxed">
                Trail captures your AI coding work from the CLIs you already use, then turns it
                into a public profile you control — featured sessions, stack tags, embed anywhere.
              </p>
              <ol className="space-y-5">
                {features.map((f, i) => (
                  <li key={f.title} className="flex gap-3 text-sm leading-relaxed">
                    <span className="font-mono text-xs text-zinc-600 tabular-nums pt-0.5 w-6">
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <div>
                      <div className="text-zinc-100 font-medium mb-1">{f.title}</div>
                      <div className="text-zinc-400">{f.body}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                  <span className="ml-2 text-[11px] font-mono text-zinc-500">~/projects/trail</span>
                </div>
                <pre className="px-4 py-4 text-[12.5px] font-mono leading-relaxed text-zinc-300 overflow-x-auto">
{`$ trail record
`}<span className="text-zinc-500">{`→ watching claude-code, codex, cursor, copilot…`}</span>{`

$ trail search "stripe webhook retry bug"
`}<span className="text-zinc-500">{`→ 3 results across claude-code, codex`}</span>{`
`}<span className="text-[#a7f300]">{`✓ jan 14 · claude-code · "Stripe idempotency keys + retry"`}</span>{`
`}<span className="text-zinc-500">{`  jan 09 · codex · "webhook 504s on Vercel cold start"`}</span>
                </pre>
              </div>

              <Link
                href={EXAMPLE_HREF}
                className="group block rounded-lg border border-zinc-800 hover:border-[#a7f300]/40 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-1.5">
                      Example session
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-100 font-medium truncate">
                      <ToolIcon name="claude-code" size={14} className="text-[#a7f300] shrink-0" />
                      <span className="truncate">{EXAMPLE_TITLE}</span>
                    </div>
                    <div className="text-xs font-mono text-zinc-500 mt-1">{EXAMPLE_META}</div>
                  </div>
                  <span className="text-zinc-500 group-hover:text-[#a7f300] transition-colors shrink-0">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-900">
          <h2 className="text-2xl font-medium tracking-tight text-zinc-50 mb-10">
            Questions
          </h2>
          <dl className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="text-sm text-zinc-100 font-medium mb-2">{f.q}</dt>
                <dd className="text-sm text-zinc-400 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-12 text-xs font-mono text-zinc-500">
            Trail is free during the v0.1 preview. Pricing arrives with v1.0.
          </p>
        </section>

        {discover.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-900">
            <div className="flex items-end justify-between mb-8">
              <h2 className="text-2xl font-medium tracking-tight text-zinc-50">
                Discover
              </h2>
              <Link
                href="/discover"
                className="text-sm text-zinc-400 hover:text-[#a7f300] transition-colors"
              >
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
                      <div className="text-sm text-zinc-100 truncate group-hover:text-white">
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
          </section>
        )}

        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-900">
          <h2 className="text-2xl font-medium tracking-tight text-zinc-50 mb-10">
            Why I made this
          </h2>
          <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-zinc-400">
            <p>
              I do most of my real work inside AI coding tools now — Claude Code, Codex, Cursor,
              Copilot, Hermes. Hours of prompts, decisions, and diffs every day. None of it shows
              up on my GitHub profile.
            </p>
            <p>
              Recruiters open my repos and see one-line commits. They don&apos;t see the hour I
              spent debugging the Stripe webhook retry, the refactor I argued through with Claude,
              the agent loop I wired together at 2am. The part that&apos;s actually me.
            </p>
            <p>
              So I built Trail. Drop one link in your bio. Recruiters see how you think with AI,
              not just what shipped. Sessions are anonymized before going public, captured from
              the CLIs you already run — no proxying, no slowdown.
            </p>
            <p className="text-zinc-500">
              Local-first. Open source. Your data, your database.{" "}
              <Link
                href="/u/jankarlo.faris"
                className="text-zinc-300 hover:text-[#a7f300] underline-offset-4 underline decoration-zinc-700"
              >
                @jankarlo.faris
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 mt-10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <div className="flex items-center gap-4">
            <a href="https://github.com/janfaris/trail" className="hover:text-zinc-200 transition-colors">
              GitHub
            </a>
            <Link href="/u/jankarlo.faris" className="hover:text-zinc-200 transition-colors">
              Built by @jankarlo.faris
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
