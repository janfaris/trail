import Link from "next/link";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";

type Session = {
  slug: string;
  tool: string;
  title: string | null;
  summary: string | null;
  repo: string | null;
  eventCount: number;
  startedAt: Date;
};

export function FeaturedSessionCard({
  session,
  handle,
}: {
  session: Session;
  handle: string;
}) {
  const snippet = session.summary?.split("\n").slice(0, 2).join(" ").slice(0, 220);
  return (
    <Link
      href={`/u/${handle}/${session.slug}`}
      className="group block border border-zinc-800 bg-zinc-900/40 rounded-md p-6 hover:border-[#a7f300]/60 hover:bg-zinc-900/70 transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#a7f300] font-mono mb-3">
        <span>★ Featured</span>
      </div>
      <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-50 leading-snug group-hover:text-white">
        {session.title || session.slug}
      </h2>
      {snippet && (
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed line-clamp-2">
          {snippet}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <ToolIcon name={session.tool} size={12} className="text-zinc-400" />
          {session.tool}
        </span>
        {session.repo && <span className="truncate max-w-[18rem]">{session.repo}</span>}
        <RelativeTime date={session.startedAt} className="tabular-nums" />
        <span className="tabular-nums">{session.eventCount} events</span>
        <span className="ml-auto text-zinc-300 group-hover:text-[#a7f300]">
          View session →
        </span>
      </div>
    </Link>
  );
}
