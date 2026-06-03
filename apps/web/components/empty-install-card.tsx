import { CopyButton } from "@/components/copy-button";
import Link from "next/link";

const STEPS: { n: number; title: string; cmd: string }[] = [
  {
    n: 1,
    title: "Install the CLI",
    cmd: "curl -fsSL https://gettrail.vercel.app/install.sh | bash",
  },
  { n: 2, title: "Sign in", cmd: "trail login" },
  { n: 3, title: "Start recording", cmd: "trail record" },
];

export function EmptyInstallCard() {
  return (
    <div className="border border-zinc-900 rounded-lg bg-zinc-950 p-6 md:p-8">
      <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#a7f300] mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
        Your portfolio is empty · 3 steps to fill it
      </div>
      <h2 className="text-2xl font-medium tracking-tight text-zinc-50 mb-2">
        Install the CLI and your next session lands here
      </h2>
      <p className="text-sm text-zinc-400 leading-relaxed mb-8 max-w-xl">
        Trail captures your work from Claude Code, Codex, Cursor, Copilot, and Hermes — then turns
        it into a public portfolio you can drop in your bio. Public profiles need at least 3
        sessions before they list publicly.
      </p>

      <ol className="space-y-5">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-4">
            <span className="font-mono text-xs text-zinc-600 tabular-nums pt-3 w-6 shrink-0">
              {s.n.toString().padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 font-medium mb-1.5">{s.title}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center h-10 px-3 rounded-md border border-white/10 bg-zinc-900/60 font-mono text-[13px] text-zinc-200 overflow-x-auto">
                  <span className="text-zinc-600 select-none mr-2">$</span>
                  <span className="whitespace-nowrap">{s.cmd}</span>
                </div>
                <CopyButton value={s.cmd} label="Copy" copiedLabel="Copied" className="h-10 px-3" />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 pt-5 border-t border-zinc-900 text-xs font-mono text-zinc-500">
        Full guide:{" "}
        <Link
          href="/install"
          className="text-zinc-300 hover:text-[#a7f300] underline-offset-4 hover:underline"
        >
          /install
        </Link>
      </div>
    </div>
  );
}
