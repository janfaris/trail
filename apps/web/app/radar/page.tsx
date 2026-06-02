import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import {
  RADAR_CATEGORIES,
  RADAR_X_SOURCES,
  type RadarCategory,
  isActiveRadarSource,
  radarCategoryLabel,
} from "@/lib/radar-sources";
import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Radar Feed | Trail",
  description:
    "Fresh X signals for AI builders, sorted as claims to test and verify with public Trail receipts.",
  alternates: {
    canonical: "/radar",
  },
};

type RadarSearchParams = {
  category?: string | string[];
  source?: string | string[];
};

type RadarSignalRow = {
  [key: string]: unknown;
  id: string;
  sourceHandle: string;
  sourceName: string | null;
  externalId: string;
  url: string;
  text: string;
  title: string;
  summary: string;
  whyBuildersCare: string;
  testPrompt: string;
  category: RadarCategory;
  status: string;
  score: unknown;
  metrics: Record<string, unknown> | null;
  tags: string[] | null;
  publishedAt: Date | string;
  fetchedAt: Date | string;
};

type RadarStatsRaw = {
  [key: string]: unknown;
  total: unknown;
  lastDay: unknown;
  sources: unknown;
  latestFetchedAt: Date | string | null;
};

type RadarCategoryCountRaw = {
  [key: string]: unknown;
  category: RadarCategory;
  count: unknown;
};

type RadarSourceCountRaw = {
  [key: string]: unknown;
  handle: string;
  count: unknown;
  latestAt: Date | string | null;
};

type RadarData = {
  stats: {
    total: number;
    lastDay: number;
    sources: number;
    latestFetchedAt: Date | string | null;
  };
  categoryCounts: Map<RadarCategory, number>;
  sourceCounts: Map<string, RadarSourceCountRaw>;
  signals: RadarSignalRow[];
  available: boolean;
};

const emptyRadarData: RadarData = {
  stats: {
    total: 0,
    lastDay: 0,
    sources: 0,
    latestFetchedAt: null,
  },
  categoryCounts: new Map(),
  sourceCounts: new Map(),
  signals: [],
  available: false,
};

const categoryIds = new Set<RadarCategory>(RADAR_CATEGORIES.map((category) => category.id));
const sourceHandles = new Set(RADAR_X_SOURCES.map((source) => source.handle));

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeCategory(value: string | string[] | undefined): RadarCategory | null {
  const raw = firstParam(value);
  return raw && categoryIds.has(raw as RadarCategory) ? (raw as RadarCategory) : null;
}

function normalizeSource(value: string | string[] | undefined): string | null {
  const raw = firstParam(value)?.replace(/^@/, "").toLowerCase();
  return raw && sourceHandles.has(raw) ? raw : null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(
    value,
  );
}

function filterHref(params: { category?: RadarCategory | null; source?: string | null }): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.source) sp.set("source", params.source);
  const query = sp.toString();
  return query ? `/radar?${query}` : "/radar";
}

function metricNumber(metrics: Record<string, unknown> | null, key: string): number {
  const raw = metrics?.[key];
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function engagementCount(signal: RadarSignalRow): number {
  return (
    metricNumber(signal.metrics, "like_count") +
    metricNumber(signal.metrics, "reply_count") +
    metricNumber(signal.metrics, "retweet_count") +
    metricNumber(signal.metrics, "quote_count") +
    metricNumber(signal.metrics, "bookmark_count")
  );
}

async function loadRadarData(
  category: RadarCategory | null,
  source: string | null,
): Promise<RadarData> {
  if (!process.env.DATABASE_URL) return emptyRadarData;

  try {
    const { db } = await import("@/db/client");
    const categoryFilter = category ? sql`AND category = ${category}` : sql``;
    const sourceFilter = source ? sql`AND source_handle = ${source}` : sql``;
    const [statsResult, categoryResult, sourceResult, signalResult] = await Promise.all([
      db.execute<RadarStatsRaw>(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE published_at >= now() - interval '24 hours')::int AS "lastDay",
          count(DISTINCT source_handle)::int AS sources,
          max(fetched_at) AS "latestFetchedAt"
        FROM radar_signal
        WHERE status <> 'dismissed'
      `),
      db.execute<RadarCategoryCountRaw>(sql`
        SELECT category, count(*)::int AS count
        FROM radar_signal
        WHERE status <> 'dismissed'
        GROUP BY category
      `),
      db.execute<RadarSourceCountRaw>(sql`
        SELECT
          source_handle AS handle,
          count(*)::int AS count,
          max(published_at) AS "latestAt"
        FROM radar_signal
        WHERE status <> 'dismissed'
        GROUP BY source_handle
      `),
      db.execute<RadarSignalRow>(sql`
        SELECT
          id,
          source_handle AS "sourceHandle",
          source_name AS "sourceName",
          external_id AS "externalId",
          url,
          text,
          title,
          summary,
          why_builders_care AS "whyBuildersCare",
          test_prompt AS "testPrompt",
          category,
          status,
          score,
          metrics,
          tags,
          published_at AS "publishedAt",
          fetched_at AS "fetchedAt"
        FROM radar_signal
        WHERE status <> 'dismissed'
          ${categoryFilter}
          ${sourceFilter}
        ORDER BY published_at DESC, fetched_at DESC
        LIMIT 36
      `),
    ]);

    const stats = rowsOf<RadarStatsRaw>(statsResult)[0];
    const categoryCounts = new Map<RadarCategory, number>(
      rowsOf<RadarCategoryCountRaw>(categoryResult).map((row) => [
        row.category,
        toNumber(row.count),
      ]),
    );
    const sourceCounts = new Map(
      rowsOf<RadarSourceCountRaw>(sourceResult).map((row) => [row.handle, row]),
    );

    return {
      available: true,
      stats: {
        total: toNumber(stats?.total),
        lastDay: toNumber(stats?.lastDay),
        sources: toNumber(stats?.sources),
        latestFetchedAt: stats?.latestFetchedAt ?? null,
      },
      categoryCounts,
      sourceCounts,
      signals: rowsOf<RadarSignalRow>(signalResult),
    };
  } catch (error) {
    console.error("Failed to load radar data", error);
    return emptyRadarData;
  }
}

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<RadarSearchParams>;
}) {
  const sp = await searchParams;
  const activeCategory = normalizeCategory(sp.category);
  const activeSource = normalizeSource(sp.source);
  const data = await loadRadarData(activeCategory, activeSource);
  const featuredSignal = data.signals[0];
  const orderedSources = [...RADAR_X_SOURCES].sort(
    (a, b) =>
      Number(isActiveRadarSource(b.handle)) - Number(isActiveRadarSource(a.handle)) ||
      a.priority - b.priority ||
      a.handle.localeCompare(b.handle),
  );

  return (
    <div className="min-h-screen bg-black text-zinc-50">
      <SiteNav currentPath="/radar" />

      <main className="bg-[radial-gradient(circle_at_12%_0%,rgba(167,243,0,0.08),transparent_28%),#000]">
        <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,760px)_300px] lg:px-8 lg:py-6">
          <div className="space-y-4">
            <section className="rounded-[24px] border border-zinc-800 bg-zinc-950/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.42)] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
                    Radar feed
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">
                    Fresh AI builder claims
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                    Newest posts first. Use Radar to spot a claim, test it, then publish the receipt
                    as proof.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[360px]">
                  <StatCard label="signals" value={formatCount(data.stats.total)} />
                  <StatCard label="today" value={formatCount(data.stats.lastDay)} />
                  <StatCard label="sources" value={formatCount(data.stats.sources)} />
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                      refreshed
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-100">
                      {data.stats.latestFetchedAt ? (
                        <RelativeTime date={data.stats.latestFetchedAt} />
                      ) : (
                        "not yet"
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[22px] border border-zinc-800 bg-zinc-950/78 p-3">
              <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Filter by category
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterPill href={filterHref({ source: activeSource })} active={!activeCategory}>
                  All
                </FilterPill>
                {RADAR_CATEGORIES.map((category) => (
                  <FilterPill
                    key={category.id}
                    href={filterHref({ category: category.id, source: activeSource })}
                    active={activeCategory === category.id}
                  >
                    {category.shortLabel}
                    <span className="ml-2 text-zinc-600">
                      {formatCount(data.categoryCounts.get(category.id) ?? 0)}
                    </span>
                  </FilterPill>
                ))}
              </div>
            </section>

            {featuredSignal ? (
              <section className="grid gap-4">
                <div className="flex items-end justify-between gap-4 px-1">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
                      Latest pulls
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-zinc-50">
                      Newest claims from curated X sources
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Sorted by tweet publish time, not engagement score.
                    </p>
                  </div>
                  <Link
                    href="/feed"
                    className="hidden rounded-full border border-zinc-800 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 transition hover:border-[#a7f300]/40 hover:text-[#a7f300] sm:inline-flex"
                  >
                    Open feed
                  </Link>
                </div>
                <div className="grid gap-4">
                  {data.signals.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyRadarState tableAvailable={data.available} />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <section className="overflow-hidden rounded-[24px] border border-zinc-800 bg-zinc-950/88">
              <div className="border-b border-zinc-900 px-4 py-4">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-zinc-50">Sources</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  Active sources are pulled every 6 hours. Paused sources remain filterable for
                  older signals.
                </p>
              </div>
              <div className="divide-y divide-zinc-900">
                {orderedSources.map((source) => {
                  const count = toNumber(data.sourceCounts.get(source.handle)?.count);
                  const active = isActiveRadarSource(source.handle);
                  return (
                    <Link
                      href={filterHref({ category: activeCategory, source: source.handle })}
                      key={source.handle}
                      className={`block px-4 py-3 transition hover:bg-black/45 ${
                        activeSource === source.handle ? "bg-[#a7f300]/[0.07]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-zinc-100">@{source.handle}</div>
                          <div className="mt-1 text-[11px] text-zinc-600">
                            {active ? "active" : "paused"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-500">
                            {formatCount(count)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-zinc-500">{source.role}</p>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#a7f300]/25 bg-[#a7f300]/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a7f300]">
                How to use it
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Open a fresh claim, test it with your stack, then publish the receipt back to Trail.
              </p>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-2 font-mono text-xl text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
        active
          ? "bg-[#a7f300] text-black"
          : "border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-[#a7f300]/45 hover:text-[#a7f300]"
      }`}
    >
      {children}
    </Link>
  );
}

function SignalCard({ signal }: { signal: RadarSignalRow }) {
  const engagement = engagementCount(signal);

  return (
    <article className="overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950/86 shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:border-[#a7f300]/35">
      <div className="grid gap-px bg-zinc-900/80 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="bg-zinc-950 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="rounded-full bg-[#a7f300]/10 px-2.5 py-1 text-[#a7f300]">
              {radarCategoryLabel(signal.category)}
            </span>
            <span className="text-zinc-600">@{signal.sourceHandle}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-600">
              posted <RelativeTime date={signal.publishedAt} />
            </span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-600">
              pulled <RelativeTime date={signal.fetchedAt} />
            </span>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-100/80">
              Unverified
            </span>
          </div>

          <a href={signal.url} target="_blank" rel="noreferrer" className="mt-4 block">
            <h3 className="text-pretty text-2xl font-semibold leading-tight tracking-[-0.045em] text-zinc-50 transition hover:text-[#a7f300]">
              {signal.title}
            </h3>
            <p className="mt-3 text-pretty text-sm leading-6 text-zinc-400">{signal.summary}</p>
          </a>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#a7f300]">
                Why builders care
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{signal.whyBuildersCare}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-100/75">
                How to verify
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{signal.testPrompt}</p>
            </div>
          </div>

          {signal.tags && signal.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {signal.tags.slice(0, 6).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-[10px] text-zinc-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="bg-black/72 p-5">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="radar score" value={toNumber(signal.score).toFixed(1)} />
            <MiniMetric label="engagement" value={formatCount(engagement)} />
            <MiniMetric
              label="replies"
              value={formatCount(metricNumber(signal.metrics, "reply_count"))}
            />
            <MiniMetric
              label="bookmarks"
              value={formatCount(metricNumber(signal.metrics, "bookmark_count"))}
            />
          </div>

          <div className="mt-5 space-y-2">
            <a
              href={signal.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-zinc-100 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-black transition hover:bg-[#a7f300]"
            >
              Open X signal
            </a>
            <Link
              href="/feed#feed-composer"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-zinc-800 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[#a7f300]/50 hover:text-[#a7f300]"
            >
              Publish proof
            </Link>
            <Link
              href={`/learn?q=${encodeURIComponent(signal.category.replace(/_/g, " "))}`}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-full px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 transition hover:bg-zinc-950 hover:text-zinc-100"
            >
              Find lessons
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

function EmptyRadarState({ tableAvailable }: { tableAvailable: boolean }) {
  return (
    <section className="rounded-[28px] border border-dashed border-zinc-800 bg-zinc-950/68 p-6 text-center">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
          {tableAvailable ? "No matching signals" : "Radar not hydrated yet"}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
          Run the local xurl fetcher to fill Radar.
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          The product path is automatic curation, not pasted URLs. The first ingestion runs from
          your machine because that is where xurl is authenticated.
        </p>
        <code className="mt-5 block rounded-2xl bg-black p-4 text-left font-mono text-[12px] leading-6 text-[#a7f300]">
          pnpm -F @trail/web run radar:fetch -- --apply --limit=10
        </code>
      </div>
    </section>
  );
}
