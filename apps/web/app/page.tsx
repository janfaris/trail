import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";

const features = [
  "Local-first capture from Claude Code, Codex, Cursor, Aider.",
  "Secrets, paths, emails scrubbed before anything leaves your machine.",
  "Shareable links with a clean diff viewer and tool-call inspector.",
  "Open format — every session is portable JSON, not a SaaS hostage.",
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    desc: "5 share links / month",
    features: ["Public sessions", "Basic search", "Community support"],
  },
  {
    name: "Pro",
    price: "$15",
    desc: "For solo builders",
    features: ["Unlimited share links", "Custom domain", "Private sessions", "Priority support"],
    featured: true,
  },
  {
    name: "Team",
    price: "$30",
    desc: "Per user · per month",
    features: ["Everything in Pro", "Workspace", "Team search", "SSO"],
  },
];

const INSTALL = "npm install -g @trail/cli";

export default function Home() {
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
            <a href="/api/auth/sign-in/github">
              <Button size="sm">Sign in</Button>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-20">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
            v0.1 · open source
          </div>
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight leading-[1.02] text-zinc-50 mb-6 max-w-3xl">
            The GitHub for{" "}
            <span className="text-[#a7f300]">AI coding sessions</span>.
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl leading-relaxed mb-10">
            Record. Search. Share. Your AI work as portable, public proof-of-work — captured
            locally, scrubbed, and rendered as a clean timeline.
          </p>

          <div className="flex items-center gap-2 max-w-md mb-6">
            <div className="flex-1 flex items-center h-11 px-3 rounded-md border border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200">
              <span className="text-zinc-600 select-none mr-2">$</span>
              <span>{INSTALL}</span>
            </div>
            <CopyButton value={INSTALL} label="Copy" copiedLabel="Copied" className="h-11 px-3" />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href="/api/auth/sign-in/github">
              <Button size="default">Sign in with GitHub</Button>
            </a>
            <Link
              href="/u/jankarlo.faris/c2j05sqk"
              className="text-zinc-400 hover:text-[#a7f300] transition-colors inline-flex items-center gap-1.5"
            >
              View an example session
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
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
              <ol className="space-y-3">
                {features.map((f, i) => (
                  <li key={f} className="flex gap-3 text-sm text-zinc-300 leading-relaxed">
                    <span className="font-mono text-xs text-zinc-600 tabular-nums pt-0.5 w-6">
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                <span className="ml-2 text-[11px] font-mono text-zinc-500">~/projects/trail</span>
              </div>
              <pre className="px-4 py-4 text-[12.5px] font-mono leading-relaxed text-zinc-300 overflow-x-auto">
{`$ trail share ~/.claude/sessions/2026-05-18.jsonl
`}<span className="text-zinc-500">{`→ anonymizing… 142 events, 8 file diffs`}</span>{`
`}<span className="text-zinc-500">{`→ uploading…`}</span>{`
`}<span className="text-[#a7f300]">{`✓ https://trail.dev/u/you/c2j05sqk`}</span>{`

$ trail whoami
`}<span className="text-zinc-400">{`signed in as @you`}</span>
              </pre>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-900">
          <h2 className="text-2xl font-medium tracking-tight text-zinc-50 mb-2">Pricing</h2>
          <p className="text-zinc-500 mb-10">Start free. Upgrade when you need more.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={
                  "rounded-lg border bg-zinc-900/40 p-6 " +
                  (t.featured
                    ? "border-[#a7f300]/40 bg-zinc-900/70 ring-1 ring-[#a7f300]/10"
                    : "border-zinc-800")
                }
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-mono uppercase tracking-[0.12em] text-zinc-400">
                    {t.name}
                  </h3>
                  {t.featured && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#a7f300]">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-medium tracking-tight text-zinc-50 tabular-nums">
                    {t.price}
                  </span>
                  <span className="text-zinc-500 text-sm">/mo</span>
                </div>
                <p className="text-xs text-zinc-500 mb-5">{t.desc}</p>
                <ul className="space-y-2 text-sm text-zinc-300">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <span
                        className={t.featured ? "text-[#a7f300]" : "text-zinc-600"}
                        aria-hidden
                      >
                        →
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
