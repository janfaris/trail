import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = {
  title: "Install Trail",
  description:
    "Install the Trail CLI, sign in, and start recording your AI coding sessions.",
};

const INSTALL_CMD = "curl -fsSL https://gettrail.vercel.app/install.sh | bash";
const SIGNIN_CMD = "trail login";
const RECORD_CMD = "trail record";

const quickRef: { cmd: string; desc: string }[] = [
  { cmd: "trail whoami", desc: "show signed-in handle" },
  { cmd: "trail share latest", desc: "publish your most recent session" },
  { cmd: 'trail search "deploy fix"', desc: "full-text search your history" },
];

function Step({
  n,
  title,
  body,
  cmd,
}: {
  n: number;
  title: string;
  body: string;
  cmd: string;
}) {
  return (
    <li className="flex gap-5">
      <span className="font-mono text-xs text-zinc-600 tabular-nums pt-1 w-6 shrink-0">
        {n.toString().padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-medium tracking-tight text-zinc-50 mb-1">
          {title}
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-3 max-w-xl">
          {body}
        </p>
        <div className="flex items-center gap-2 max-w-xl">
          <div className="flex-1 flex items-center h-11 px-3 rounded-md border border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200 overflow-x-auto">
            <span className="text-zinc-600 select-none mr-2">$</span>
            <span className="whitespace-nowrap">{cmd}</span>
          </div>
          <CopyButton value={cmd} label="Copy" copiedLabel="Copied" className="h-11 px-3" />
        </div>
      </div>
    </li>
  );
}

export default function InstallPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center justify-between">
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
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 pt-20 pb-24 w-full">
        <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-zinc-500 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
          Install · 3 steps · ~60 seconds
        </div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.05] text-zinc-50 mb-4">
          Install <span className="text-[#a7f300]">Trail</span>.
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed mb-14">
          Three commands, then every Claude Code, Codex, Hermes, and Copilot session
          you run gets captured automatically.
        </p>

        <ol className="space-y-12">
          <Step
            n={1}
            title="Install the CLI"
            body="One-line installer. Clones the repo, builds the CLI, and symlinks `trail` into ~/.local/bin."
            cmd={INSTALL_CMD}
          />
          <Step
            n={2}
            title="Sign in"
            body="Pairs the CLI with your GitHub account so you can share sessions as public links."
            cmd={SIGNIN_CMD}
          />
          <Step
            n={3}
            title="Start recording"
            body="Tails the log files your AI tools already write. Zero hooks, zero proxying, no slowdown."
            cmd={RECORD_CMD}
          />
        </ol>

        <section className="mt-20 pt-10 border-t border-zinc-900">
          <h2 className="text-xs font-mono uppercase tracking-[0.16em] text-zinc-500 mb-5">
            Quick reference
          </h2>
          <dl className="space-y-3">
            {quickRef.map((q) => (
              <div
                key={q.cmd}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5"
              >
                <dt className="font-mono text-sm text-zinc-200 sm:w-64 shrink-0">
                  {q.cmd}
                </dt>
                <dd className="text-sm text-zinc-500">{q.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 border-t border-zinc-900 pt-8 text-sm text-zinc-500">
          Already on Trail?{" "}
          <Link href="/search" className="text-[#a7f300] hover:underline">
            Search across all public sessions →
          </Link>
        </section>
      </main>

      <footer className="border-t border-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <Link href="/" className="hover:text-zinc-200 transition-colors">
            ← Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
