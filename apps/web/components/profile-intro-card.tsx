import { dismissIntro } from "@/app/u/[user]/actions";
import Link from "next/link";

export function ProfileIntroCard() {
  return (
    <div className="relative mb-8 rounded-[1.5rem] border border-white/10 bg-zinc-900/40 px-5 py-4">
      <form action={dismissIntro}>
        <button
          type="submit"
          aria-label="Dismiss"
          className="absolute top-3 right-3 px-1.5 py-0.5 font-mono text-xs text-zinc-500 hover:text-zinc-200"
        >
          x
        </button>
      </form>

      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent-text)]">
        This is a Trail builder profile
      </div>
      <p className="max-w-3xl pr-6 text-sm leading-relaxed text-zinc-300">
        Build posts, proof links, comments, and follows collect here. Start by publishing what you
        just shipped; agent logs are optional proof, not the main path.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/create"
          className="inline-flex min-h-9 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97]"
        >
          Post a build
        </Link>
        <Link
          href="/settings"
          className="inline-flex min-h-9 items-center rounded-full bg-zinc-950 px-4 text-sm font-semibold text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
        >
          Edit identity
        </Link>
      </div>
    </div>
  );
}
