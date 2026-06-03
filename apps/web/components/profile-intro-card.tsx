import { dismissIntro } from "@/app/u/[user]/actions";
import { CopyButton } from "@/components/copy-button";

const STEPS: { code: string; note?: string }[] = [
  { code: "curl -fsSL https://gettrail.vercel.app/install.sh | sh", note: "install the CLI" },
  { code: "trail login", note: "sign in once" },
  { code: "trail record", note: "captures your AI coding tools" },
];

export function ProfileIntroCard() {
  return (
    <div className="relative border border-white/10 bg-zinc-900/40 rounded-md px-5 py-4 mb-8">
      <form action={dismissIntro}>
        <button
          type="submit"
          aria-label="Dismiss"
          className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-200 text-xs font-mono px-1.5 py-0.5"
        >
          ✕
        </button>
      </form>

      <div className="text-[10px] uppercase tracking-[0.16em] text-[#a7f300] mb-1.5 font-mono">
        This is a Trail portfolio
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed pr-6 max-w-3xl">
        Below is how this engineer actually works with AI — real sessions from Claude Code, Cursor,
        Codex, Copilot, and Hermes. Anonymized, curated, embeddable. Three commands and you&apos;ll
        have your own.
      </p>

      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => (
          <li
            key={s.code}
            className="flex items-center gap-3 rounded border border-white/10 bg-zinc-950/60 px-3 py-2"
          >
            <span className="text-[10px] font-mono text-zinc-600 tabular-nums w-4 shrink-0">
              {i + 1}
            </span>
            <code className="font-mono text-[12.5px] text-zinc-100 flex-1 min-w-0 truncate">
              <span className="text-[#a7f300] select-none">$ </span>
              {s.code}
            </code>
            {s.note && (
              <span className="hidden md:inline text-[11px] font-mono text-zinc-500 shrink-0">
                {s.note}
              </span>
            )}
            <CopyButton value={s.code} className="h-6 px-2 text-[11px]" />
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs font-mono text-zinc-500">
        then <code className="text-zinc-300">trail share latest</code> to publish · drop{" "}
        <code className="text-zinc-300">trail.dev/u/you</code> in your bio →
      </p>
    </div>
  );
}
