import { ToolIcon } from "@/components/tool-icon";
import {
  type EntityKind,
  type EntityStat,
  KIND_NOUN,
  KIND_PLURAL,
  displayLabel,
  entityHref,
  rankEntities,
} from "@/lib/entity-tags";
import Link from "next/link";

// Public index for /tools and /frameworks. Ranks entities by honest usage
// (sessions desc) with smoothed shipped-rate as the tie-break — see
// lib/entity-tags.ts. Server component; styling mirrors /learn.

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function EntityIndex({ kind, stats }: { kind: EntityKind; stats: EntityStat[] }) {
  const ranked = rankEntities(stats);
  const plural = KIND_PLURAL[kind];

  return (
    <section className="max-w-4xl mx-auto px-6 py-10 w-full">
      <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{plural}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-1">
        {plural} ranked by real usage
      </h1>
      <p className="text-zinc-500 mb-8 text-sm font-mono">
        {ranked.length} {ranked.length === 1 ? KIND_NOUN[kind] : plural.toLowerCase()} · ranked by
        sessions, then shipped rate
      </p>

      {ranked.length === 0 ? (
        <div className="text-zinc-500 text-sm font-mono">
          No public {plural.toLowerCase()} yet. Share a session to seed this page.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-900">
          {ranked.map((e, i) => {
            const rate = e.sessions ? e.shipped / e.sessions : 0;
            return (
              <li key={e.tag} className="py-4">
                <Link href={entityHref(kind, e.tag)} className="block group">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-zinc-600 w-6 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {kind === "tool" ? (
                      <ToolIcon name={e.tag} className="w-4 h-4 shrink-0" />
                    ) : null}
                    <h2 className="text-base font-medium text-zinc-100 group-hover:text-[#a7f300] transition-colors">
                      {displayLabel(e.tag, e.label)}
                    </h2>
                  </div>
                  <div className="mt-1 ml-9 flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-500">
                    <span>
                      {e.sessions} {e.sessions === 1 ? "session" : "sessions"}
                    </span>
                    <span>·</span>
                    <span>
                      {e.builders} {e.builders === 1 ? "builder" : "builders"}
                    </span>
                    <span>·</span>
                    <span className="text-[#a7f300]">{pct(rate)} shipped</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
