import { formatRepoPath } from "@/lib/format";

export type TopReposItem = { repo: string; sessions: number; events: number };

export function TopRepos({ items }: { items: TopReposItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
      {items.map((r) => {
        const short = formatRepoPath(r.repo) ?? r.repo;
        return (
          <span
            key={r.repo}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5"
          >
            <span className="text-zinc-300">{short}</span>
            <span className="text-zinc-600">·</span>
            <span className="tabular-nums text-zinc-500">
              {r.sessions} session{r.sessions === 1 ? "" : "s"}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="tabular-nums text-zinc-500">{r.events} events</span>
          </span>
        );
      })}
    </div>
  );
}
