import { RelativeTime } from "@/components/relative-time";
import { ToolIcon } from "@/components/tool-icon";
import { formatRepoPath } from "@/lib/format";
import { formatDuration } from "@/lib/session-metrics";
import Link from "next/link";

type Session = {
  slug: string;
  tool: string;
  title: string | null;
  summary: string | null;
  repo: string | null;
  eventCount: number;
  startedAt: Date;
  durationSeconds?: number | null;
};

export function FeaturedSessionCard({
  session,
  handle,
  variant = "hero",
}: {
  session: Session;
  handle: string;
  variant?: "hero" | "compact";
}) {
  const repo = formatRepoPath(session.repo);
  const title = session.title || session.slug;

  if (variant === "compact") {
    return (
      <Link
        href={`/u/${handle}/${session.slug}`}
        title={title}
        className="group flex items-center gap-4 border border-zinc-900 bg-zinc-950 rounded-md p-4 hover:border-white/20 hover:bg-zinc-900/40 transition-colors"
      >
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#a7f300] font-mono shrink-0">
          ★
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 truncate group-hover:text-white">{title}</div>
          <div className="mt-1 flex items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <ToolIcon name={session.tool} size={11} className="text-zinc-500" />
              {session.tool}
            </span>
            {repo && (
              <span className="truncate max-w-[14rem]" title={session.repo ?? undefined}>
                {repo}
              </span>
            )}
            <RelativeTime date={session.startedAt} className="tabular-nums" />
            <span className="tabular-nums">{session.eventCount} ev</span>
            {session.durationSeconds != null && (
              <span className="tabular-nums">{formatDuration(session.durationSeconds)}</span>
            )}
          </div>
        </div>
        <span className="text-xs font-mono text-zinc-600 group-hover:text-[#a7f300] shrink-0">
          →
        </span>
      </Link>
    );
  }

  const snippet = session.summary?.split("\n").slice(0, 2).join(" ").slice(0, 240);
  return (
    <Link
      href={`/u/${handle}/${session.slug}`}
      title={title}
      className="group block border border-white/10 bg-zinc-900/40 rounded-md p-8 md:p-10 hover:border-[#a7f300]/60 hover:bg-zinc-900/70 transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#a7f300] font-mono mb-4">
        <span>★ Featured</span>
      </div>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-50 leading-[1.15] group-hover:text-white">
        {title}
      </h2>
      {snippet && (
        <p className="mt-3 text-[15px] text-zinc-400 leading-relaxed line-clamp-2 max-w-2xl">
          {snippet}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <ToolIcon name={session.tool} size={12} className="text-zinc-400" />
          {session.tool}
        </span>
        {repo && (
          <span className="truncate max-w-[18rem]" title={session.repo ?? undefined}>
            {repo}
          </span>
        )}
        <RelativeTime date={session.startedAt} className="tabular-nums" />
        <span className="tabular-nums">{session.eventCount} events</span>
        {session.durationSeconds != null && (
          <span className="tabular-nums">{formatDuration(session.durationSeconds)}</span>
        )}
        <span className="ml-auto text-zinc-300 group-hover:text-[#a7f300]">View session →</span>
      </div>
    </Link>
  );
}
