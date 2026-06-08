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
    <section className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="rounded-[2rem] bg-zinc-950/82 p-5 shadow-[var(--trail-shadow-border)] sm:p-7">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-[var(--accent-text)]">
          {plural}
        </p>
        <h1 className="mb-1 text-3xl font-semibold tracking-[-0.05em] text-zinc-50">
          {plural} ranked by real usage
        </h1>
        <p className="mb-8 text-sm leading-6 text-zinc-500">
          {ranked.length} {ranked.length === 1 ? KIND_NOUN[kind] : plural.toLowerCase()} ranked by
          public receipts and shipped rate.
        </p>

        {ranked.length === 0 ? (
          <div className="rounded-2xl bg-black/30 p-5 text-sm leading-6 text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
            No public {plural.toLowerCase()} yet. Publish a receipt to seed this page.
          </div>
        ) : (
          <ul className="grid gap-2">
            {ranked.map((e, i) => {
              const rate = e.sessions ? e.shipped / e.sessions : 0;
              return (
                <li key={e.tag}>
                  <Link
                    href={entityHref(kind, e.tag)}
                    className="group block rounded-2xl bg-black/24 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-[background-color,box-shadow] hover:bg-black/38 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 shrink-0 font-mono text-[11px] text-zinc-600">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {kind === "tool" ? (
                        <ToolIcon name={e.tag} className="h-4 w-4 shrink-0" />
                      ) : null}
                      <h2 className="text-base font-medium text-zinc-100 transition-[color] group-hover:text-[var(--accent-text)]">
                        {displayLabel(e.tag, e.label)}
                      </h2>
                    </div>
                    <div className="mt-2 ml-9 flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
                      <span>
                        {e.sessions} {e.sessions === 1 ? "session" : "sessions"}
                      </span>
                      <span>·</span>
                      <span>
                        {e.builders} {e.builders === 1 ? "builder" : "builders"}
                      </span>
                      <span>·</span>
                      <span className="text-[var(--accent-text)]">{pct(rate)} shipped</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
