import { dismissIntro } from "@/app/u/[user]/actions";

export function ProfileIntroCard() {
  return (
    <form
      action={dismissIntro}
      className="relative border border-zinc-800 bg-zinc-900/40 rounded-md px-5 py-4 mb-8"
    >
      <button
        type="submit"
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-200 text-xs font-mono px-1.5 py-0.5"
      >
        ✕
      </button>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[#a7f300] mb-1.5 font-mono">
        What is Trail?
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed pr-6 max-w-3xl">
        Trail records AI coding sessions across Claude Code, Cursor, Codex, Copilot, and
        Hermes. The sessions below are real work — searchable, anonymized, shareable.
        Want this for your own work?{" "}
        <code className="text-[#a7f300] font-mono text-[12.5px] bg-zinc-950/60 px-1 py-0.5 rounded">
          npm i -g @trail/cli
        </code>{" "}
        <span className="text-zinc-500">·</span>{" "}
        <a
          href="https://github.com/janfaris/trail"
          className="text-zinc-400 hover:text-zinc-100 underline underline-offset-2 decoration-zinc-700"
        >
          view source
        </a>
      </p>
    </form>
  );
}
