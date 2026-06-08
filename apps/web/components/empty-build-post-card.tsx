import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Post a build",
    body: "Write what you shipped, why it matters, and what feedback you want.",
  },
  {
    n: "02",
    title: "Add proof links",
    body: "Attach GitHub, demo, X, or screenshot links. Logs stay optional.",
  },
  {
    n: "03",
    title: "Share your profile",
    body: "Your public profile fills from build posts, comments, follows, and saved work.",
  },
];

export function EmptyBuildPostCard() {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950 p-6 md:p-8">
      <div className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent-text)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
        Your profile is ready for its first build
      </div>
      <h2 className="mb-2 text-2xl font-medium tracking-tight text-zinc-50">
        Start with a build post. No install required.
      </h2>
      <p className="mb-8 max-w-xl text-sm leading-relaxed text-zinc-400">
        Trail profiles should show what you are building now. Publish manually, paste proof links,
        and let the network form around the work.
      </p>

      <ol className="grid gap-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="grid gap-3 rounded-2xl border border-white/10 bg-zinc-900/45 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)]"
          >
            <span className="font-mono text-xs tabular-nums text-zinc-600">{step.n}</span>
            <span>
              <span className="block text-sm font-medium text-zinc-200">{step.title}</span>
              <span className="mt-1 block text-sm leading-6 text-zinc-500">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-5">
        <Link
          href="/create"
          className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97]"
        >
          Post a build
        </Link>
        <Link
          href="/settings"
          className="inline-flex min-h-10 items-center rounded-full bg-white/[0.04] px-4 text-sm font-semibold text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
        >
          Complete profile
        </Link>
      </div>
    </div>
  );
}
