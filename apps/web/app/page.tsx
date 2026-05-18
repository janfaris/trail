import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { ToolIcon } from "@/components/tool-icon";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";

const EXAMPLE_HREF = "/u/jankarlo.faris/057smo2q";
const EXAMPLE_TITLE = "Lupa · pricing research session";
const EXAMPLE_META = "41 events · Claude Code";

const features = [
  {
    title: "Captures automatically",
    body: "No extra steps. trail record tails the log files your AI tools already write — zero hooks, zero proxying.",
  },
  {
    title: "Searches your history",
    body: "Find that fix from two weeks ago in two seconds. Full-text across every session, every tool.",
  },
  {
    title: "Shares as portable proof-of-work",
    body: "Public links for your portfolio, bio, or DMs. Anonymized before upload — paths and secrets scrubbed.",
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
    q: "Does it slow my AI agent?",
    a: "No. Trail reads the log files your tools already write. Zero hooks, zero proxying.",
  },
  {
    q: "Is my data private?",
    a: "Yes by default. Sessions stay on your machine until you explicitly run trail share.",
  },
  {
    q: "What about Anthropic or OpenAI shipping their own viewer?",
    a: "They will, eventually — but only for their own tool. Trail is cross-vendor: one feed, all your work, portable.",
  },
];

const INSTALL = "npm install -g @trail/cli";

export default async function Home() {
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  const userRow = sessionInfo?.user
    ? await db.query.user.findFirst({ where: eq(schema.user.id, sessionInfo.user.id) })
    : null;
  const handle = userRow?.handle ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-5 text-sm">
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
            Your AI coding work,{" "}
            <span className="text-[#a7f300]">recorded</span>.
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed mb-10">
            Trail captures every Claude Code, Codex, Hermes, and Copilot session into a
            searchable archive. Share any session as a public link — proof of how you actually
            work.
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
                Built for the way you actually work
              </h2>
              <p className="text-zinc-500 mb-8 leading-relaxed">
                Trail snaps onto your existing CLI — no agents, no IDE plugins, no
                analytics SDK.
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
`}<span className="text-zinc-500">{`→ watching claude-code, codex, hermes, copilot…`}</span>{`

$ trail share latest
`}<span className="text-zinc-500">{`→ anonymizing… 41 events, 6 file diffs`}</span>{`
`}<span className="text-[#a7f300]">{`✓ https://trail.dev/u/you/057smo2q`}</span>
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
          <dl className="grid md:grid-cols-3 gap-8">
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

        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-900">
          <h2 className="text-2xl font-medium tracking-tight text-zinc-50 mb-10">
            Why I made this
          </h2>
          <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-zinc-400">
            <p>
              I do most of my real work inside AI coding tools now — Claude Code, Codex, Cursor,
              Copilot, Hermes. Every session has hours of prompts, decisions, and diffs that just
              vanish when I close the terminal.
            </p>
            <p>
              No way to find that fix from two weeks ago. No way to show a friend exactly how I
              solved something. No way to prove to a hiring manager that I actually know how to
              think with these tools.
            </p>
            <p>
              So I built Trail. It tails the log files the tools already write — no proxying, no
              hooks, no slowdown. Sessions live on your machine. Search across all your work in
              two seconds. Share any session as a public link with secrets scrubbed.
            </p>
            <p className="text-zinc-500">
              Local-first. Open source. Tell me if it's useful.{" "}
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
