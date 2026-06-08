import { RelativeTime } from "@/components/relative-time";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import type { EntityDetail } from "@/lib/entity-queries";
import {
  type EntityKind,
  KIND_PLURAL,
  displayLabel,
  entityHref,
  sessionHref,
} from "@/lib/entity-tags";
import Link from "next/link";

// Public detail page body for /tools/[slug] and /frameworks/[slug]. Header
// stats are exact over the whole public corpus; the session list is the ranked,
// capped slice from the loader. Server component; styling mirrors /learn.

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold text-zinc-50 tabular-nums">{value}</span>
      <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
  );
}

export function EntityDetailView({
  kind,
  detail,
}: {
  kind: EntityKind;
  detail: EntityDetail;
}) {
  const label = displayLabel(detail.slug, detail.label);
  const { summary } = detail;

  return (
    <section className="max-w-4xl mx-auto px-6 py-10 w-full">
      <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-3">
        <Link href={`/${KIND_PLURAL[kind]}`} className="hover:text-zinc-300 capitalize">
          {KIND_PLURAL[kind]}
        </Link>
        <span>/</span>
        <span className="text-zinc-400">{detail.slug}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        {kind === "tool" ? <ToolIcon name={detail.slug} className="w-7 h-7" /> : null}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">{label}</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-10 border-y border-zinc-900 py-6">
        <Stat value={summary.total} label="sessions" />
        <Stat value={detail.builders} label="builders" />
        <Stat value={pct(summary.shippedRate)} label="shipped rate" />
        <Stat value={summary.shipped} label="shipped" />
      </div>

      {detail.topBuilders.length > 0 ? (
        <div className="mb-10">
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            Top builders
          </h2>
          <ul className="flex flex-wrap gap-3">
            {detail.topBuilders.map((b) => (
              <li key={b.handle}>
                <Link
                  href={`/u/${b.handle}`}
                  className="group flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950 pl-1 pr-3 py-1 hover:border-white/20"
                >
                  <Avatar
                    src={b.image}
                    alt={b.name ?? b.handle}
                    size={24}
                    fallback={b.name ?? b.handle}
                  />
                  <span className="text-sm text-zinc-200 group-hover:text-[var(--accent-text)]">
                    @{b.handle}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {b.shipped}/{b.sessions}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
        Sessions
      </h2>
      <ul className="divide-y divide-zinc-900">
        {detail.sessions.map((r) => {
          const href = r.handle ? sessionHref(r.handle, r.slug) : "#";
          return (
            <li key={r.id} className="py-4">
              <Link href={href} className="block group">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1">
                  <ToolIcon name={r.tool} className="w-3 h-3" />
                  <span>{r.tool}</span>
                  {r.outcome && r.outcome !== "unknown" ? (
                    <>
                      <span>·</span>
                      <span className={r.outcome === "shipped" ? "text-[var(--accent-text)]" : ""}>
                        {r.outcome}
                      </span>
                    </>
                  ) : null}
                  <span>·</span>
                  <RelativeTime date={r.sharedAt ?? r.startedAt} />
                  {r.handle ? (
                    <>
                      <span>·</span>
                      <span>@{r.handle}</span>
                    </>
                  ) : null}
                  {r.positiveReactions > 0 ? (
                    <>
                      <span>·</span>
                      <span className="text-[var(--accent-text)]">↑{r.positiveReactions}</span>
                    </>
                  ) : null}
                  {r.negativeReactions > 0 ? (
                    <>
                      <span>·</span>
                      <span className="text-zinc-600">↓{r.negativeReactions}</span>
                    </>
                  ) : null}
                </div>
                <h3 className="text-base font-medium text-zinc-100 group-hover:text-[var(--accent-text)] transition-colors">
                  {r.title ?? r.slug}
                </h3>
                {r.summary ? (
                  <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{r.summary}</p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {detail.related.length > 0 ? (
        <div className="mt-10">
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            Often used with
          </h2>
          <div className="flex flex-wrap gap-2">
            {detail.related.map((rel) => (
              <Link
                key={`${rel.kind}:${rel.tag}`}
                href={entityHref(rel.kind, rel.tag)}
                className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2 py-1 rounded hover:text-[var(--accent-text)]"
              >
                {displayLabel(rel.tag, rel.label)}
                <span className="text-zinc-600"> · {rel.sessions}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
