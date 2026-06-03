import { SiteNav } from "@/components/site-nav";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = {
  title: "Install Trail",
  description: "Install the Trail CLI, sign in, and start recording your AI coding sessions.",
};

const INSTALL_CMD = "npm install -g @gettrail/cli";
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
    <li className="flex gap-5 rounded-[1.5rem] bg-zinc-950/72 p-4 shadow-[var(--trail-shadow-border)]">
      <span className="w-6 shrink-0 pt-1 font-mono text-xs text-zinc-600 tabular-nums">
        {n.toString().padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="mb-1 text-lg font-medium tracking-tight text-zinc-50">{title}</h2>
        <p className="mb-3 max-w-xl text-sm leading-relaxed text-zinc-400">{body}</p>
        <div className="flex max-w-xl items-center gap-2">
          <div className="flex h-11 flex-1 items-center overflow-x-auto rounded-full bg-zinc-900/60 px-3 font-mono text-sm text-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
            <span className="mr-2 select-none text-zinc-600">$</span>
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
    <div className="flex min-h-screen flex-col">
      <SiteNav currentPath="/install" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-16 pb-24">
        <section className="rounded-[2rem] bg-zinc-950/82 p-5 shadow-[var(--trail-shadow-border)] sm:p-7">
          <div className="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
            Install · 3 steps · ~60 seconds
          </div>
          <h1 className="mb-4 text-4xl leading-[1.05] font-medium tracking-[-0.055em] text-zinc-50 md:text-5xl">
            Install <span className="text-[#a7f300]">Trail</span>.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-zinc-400">
            Three commands, then every Claude Code, Codex, Hermes, and Copilot session you run gets
            captured automatically.
          </p>
        </section>

        <ol className="mt-5 space-y-4">
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

        <section className="mt-8 rounded-[1.5rem] bg-zinc-950/62 p-5 shadow-[var(--trail-shadow-border)]">
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">
            Quick reference
          </h2>
          <dl className="space-y-3">
            {quickRef.map((q) => (
              <div key={q.cmd} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
                <dt className="shrink-0 font-mono text-sm text-zinc-200 sm:w-64">{q.cmd}</dt>
                <dd className="text-sm text-zinc-500">{q.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-8 text-sm text-zinc-500">
          Already on Trail?{" "}
          <Link href="/search" className="text-[#a7f300] transition-[color] hover:text-lime-200">
            Search across all public sessions →
          </Link>
        </section>
      </main>

      <footer className="border-t border-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <Link href="/" className="transition-[color] hover:text-zinc-200">
            ← Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
