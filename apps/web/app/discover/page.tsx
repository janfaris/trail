import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://gettrail.vercel.app";

export const metadata: Metadata = {
  title: "Discover AI builders shipping in public | Trail",
  description:
    "Find trending AI coding receipts, builders, stacks, and repos on Trail's proof-of-work network.",
  alternates: {
    canonical: "/discover",
  },
};

type NetworkStats = {
  receiptCount: unknown;
  builderCount: unknown;
  reactionCount: unknown;
  commentCount: unknown;
};

type ReceiptRow = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  receiptTldr: string | null;
  receiptOutcome: string | null;
  tool: string;
  repo: string | null;
  linkedRepo: string | null;
  eventCount: unknown;
  startedAt: Date;
  sharedAt: Date;
  receiptStatus: string | null;
  outcome: string | null;
  handle: string;
  name: string | null;
  image: string | null;
  githubHandle: string | null;
  reactions: unknown;
  comments: unknown;
  score: unknown;
};

type BuilderRow = {
  id: string;
  handle: string;
  name: string | null;
  image: string | null;
  githubHandle: string | null;
  receiptCount: unknown;
  shippedCount: unknown;
  eventCount: unknown;
  followerCount: unknown;
  reactionCount: unknown;
  commentCount: unknown;
  latestSharedAt: Date;
};

type StackRow = {
  kind: string;
  tag: string;
  label: string;
  receiptCount: unknown;
  builderCount: unknown;
  reactionCount: unknown;
  commentCount: unknown;
};

type RepoRow = {
  repo: string;
  receiptCount: unknown;
  builderCount: unknown;
  reactionCount: unknown;
  latestSharedAt: Date;
};

type DiscoverData = {
  stats: NetworkStats;
  receipts: ReceiptRow[];
  builders: BuilderRow[];
  stacks: StackRow[];
  repos: RepoRow[];
};

const emptyStats: NetworkStats = {
  receiptCount: 0,
  builderCount: 0,
  reactionCount: 0,
  commentCount: 0,
};

const emptyData: DiscoverData = {
  stats: emptyStats,
  receipts: [],
  builders: [],
  stacks: [],
  repos: [],
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function firstRowOf<T>(result: unknown, fallback: T): T {
  return rowsOf<T>(result)[0] ?? fallback;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCount(value: unknown): string {
  const n = toNumber(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function receiptTitle(row: ReceiptRow): string {
  return row.title ?? row.receiptTldr ?? row.summary ?? "Untitled receipt";
}

function receiptCopy(row: ReceiptRow): string {
  return (
    row.receiptOutcome ??
    row.receiptTldr ??
    row.summary ??
    "A public Trail receipt with the build log, decisions, and shipping proof."
  );
}

function builderLabel(row: { name: string | null; handle: string }): string {
  return row.name?.trim() || `@${row.handle}`;
}

function builderAvatar(row: {
  image: string | null;
  handle: string;
  githubHandle?: string | null;
}) {
  return row.image ?? githubAvatar(row.githubHandle || row.handle);
}

function isShipped(row: { receiptStatus: string | null; outcome: string | null }): boolean {
  return row.receiptStatus === "shipped" || row.outcome === "shipped";
}

function receiptReason(row: ReceiptRow): string {
  const comments = toNumber(row.comments);
  const reactions = toNumber(row.reactions);
  if (comments >= 3) return `${formatCount(comments)} comments in the thread`;
  if (reactions >= 3) return `${formatCount(reactions)} builder reactions`;
  if (isShipped(row)) return "shipped outcome with public proof";
  return `${formatCount(row.eventCount)} agent events captured`;
}

function builderReason(row: BuilderRow): string {
  const followers = toNumber(row.followerCount);
  const reactions = toNumber(row.reactionCount);
  if (followers > 0) return `${formatCount(followers)} followers watching`;
  if (reactions > 0) return `${formatCount(reactions)} receipt reactions`;
  return `${formatCount(row.shippedCount)} shipped receipts`;
}

function stackHref(row: StackRow): string {
  if (row.kind === "framework") return `/frameworks/${row.tag}`;
  if (row.kind === "tool") return `/tools/${row.tag}`;
  return `/learn?tag=${encodeURIComponent(row.tag)}`;
}

function githubRepoUrl(repo: string): string {
  return `https://github.com/${repo.replace(/^(https?:\/\/)?github\.com\//, "")}`;
}

async function loadDiscoverData(): Promise<DiscoverData> {
  const { db } = await import("@/db/client");

  const publicSessions = sql`
    select ts.*
    from trail_session ts
    join "user" u on u.id = ts.user_id
    where ts.visibility = 'public'
      and ts.shared_at is not null
      and ts.event_count > 0
      and u.handle is not null
      and u.handle <> ''
  `;

  const [statsResult, receiptsResult, buildersResult, stacksResult, reposResult] =
    await Promise.all([
      db.execute(sql`
        with public_sessions as (${publicSessions})
        select
          count(distinct ps.id)::int as "receiptCount",
          count(distinct ps.user_id)::int as "builderCount",
          count(distinct sr.id)::int as "reactionCount",
          count(distinct sc.id)::int as "commentCount"
        from public_sessions ps
        left join session_reaction sr on sr.session_id = ps.id
        left join session_comment sc on sc.session_id = ps.id and sc.deleted_at is null
      `),
      db.execute(sql`
        with public_sessions as (${publicSessions})
        select
          ps.id,
          ps.slug,
          ps.title,
          ps.summary,
          ps.receipt_tldr as "receiptTldr",
          ps.receipt_outcome as "receiptOutcome",
          ps.tool,
          ps.repo,
          ps.linked_repo as "linkedRepo",
          ps.event_count as "eventCount",
          ps.started_at as "startedAt",
          ps.shared_at as "sharedAt",
          ps.receipt_status as "receiptStatus",
          ps.outcome,
          u.handle,
          u.name,
          u.image,
          u.github_handle as "githubHandle",
          count(distinct sr.id)::int as reactions,
          count(distinct sc.id)::int as comments,
          (
            ln(ps.event_count + 1)
              * exp(-extract(epoch from (now() - ps.shared_at)) / 86400.0 / 14.0)
            + (count(distinct sr.id) filter (where sr.created_at >= now() - interval '30 days')) * 0.45
            + (count(distinct sc.id) filter (where sc.created_at >= now() - interval '30 days')) * 0.75
            + case when ps.receipt_status = 'shipped' or ps.outcome = 'shipped' then 1.25 else 0 end
          ) as score
        from public_sessions ps
        join "user" u on u.id = ps.user_id
        left join session_reaction sr on sr.session_id = ps.id
        left join session_comment sc on sc.session_id = ps.id and sc.deleted_at is null
        where ps.shared_at >= now() - interval '120 days'
        group by
          ps.id,
          ps.slug,
          ps.title,
          ps.summary,
          ps.receipt_tldr,
          ps.receipt_outcome,
          ps.tool,
          ps.repo,
          ps.linked_repo,
          ps.event_count,
          ps.started_at,
          ps.shared_at,
          ps.receipt_status,
          ps.outcome,
          u.handle,
          u.name,
          u.image,
          u.github_handle
        order by score desc, ps.shared_at desc
        limit 9
      `),
      db.execute(sql`
        with public_sessions as (${publicSessions}),
        session_social as (
          select
            ps.id,
            count(distinct sr.id)::int as reactions,
            count(distinct sc.id)::int as comments
          from public_sessions ps
          left join session_reaction sr on sr.session_id = ps.id
          left join session_comment sc on sc.session_id = ps.id and sc.deleted_at is null
          group by ps.id
        ),
        builder_receipts as (
          select
            u.id,
            u.handle,
            u.name,
            u.image,
            u.github_handle as "githubHandle",
            count(*)::int as "receiptCount",
            (count(*) filter (
              where ps.receipt_status = 'shipped' or ps.outcome = 'shipped'
            ))::int as "shippedCount",
            coalesce(sum(ps.event_count), 0)::int as "eventCount",
            coalesce(sum(ss.reactions), 0)::int as "reactionCount",
            coalesce(sum(ss.comments), 0)::int as "commentCount",
            max(ps.shared_at) as "latestSharedAt"
          from public_sessions ps
          join "user" u on u.id = ps.user_id
          left join session_social ss on ss.id = ps.id
          where ps.shared_at >= now() - interval '180 days'
          group by u.id, u.handle, u.name, u.image, u.github_handle
        ),
        followers as (
          select following_id, count(distinct follower_id)::int as "followerCount"
          from follow
          group by following_id
        )
        select
          br.id,
          br.handle,
          br.name,
          br.image,
          br."githubHandle",
          br."receiptCount",
          br."shippedCount",
          br."eventCount",
          coalesce(f."followerCount", 0)::int as "followerCount",
          br."reactionCount",
          br."commentCount",
          br."latestSharedAt"
        from builder_receipts br
        left join followers f on f.following_id = br.id
        order by
          br."receiptCount" * 2
          + br."shippedCount" * 3
          + coalesce(f."followerCount", 0) * 1.5
          + br."reactionCount"
          + br."commentCount" * 1.5 desc,
          br."latestSharedAt" desc
        limit 8
      `),
      db.execute(sql`
        with public_sessions as (${publicSessions}),
        session_social as (
          select
            ps.id,
            count(distinct sr.id)::int as reactions,
            count(distinct sc.id)::int as comments
          from public_sessions ps
          left join session_reaction sr on sr.session_id = ps.id
          left join session_comment sc on sc.session_id = ps.id and sc.deleted_at is null
          group by ps.id
        )
        select
          st.kind,
          lower(st.tag) as tag,
          max(st.label) as label,
          count(distinct ps.id)::int as "receiptCount",
          count(distinct ps.user_id)::int as "builderCount",
          coalesce(sum(ss.reactions), 0)::int as "reactionCount",
          coalesce(sum(ss.comments), 0)::int as "commentCount"
        from session_tag st
        join public_sessions ps on ps.id = st.session_id
        left join session_social ss on ss.id = ps.id
        where st.kind in ('tool', 'framework', 'model')
        group by st.kind, lower(st.tag)
        order by
          count(distinct ps.id) * 2
          + count(distinct ps.user_id) * 1.5
          + coalesce(sum(ss.reactions), 0)
          + coalesce(sum(ss.comments), 0) * 1.5 desc,
          count(distinct ps.id) desc
        limit 12
      `),
      db.execute(sql`
        with public_sessions as (${publicSessions}),
        repo_sessions as (
          select
            ps.*,
            lower(
              regexp_replace(
                coalesce(nullif(ps.linked_repo, ''), nullif(ps.repo, '')),
                '^(https?://)?github.com/',
                ''
              )
            ) as repo_key
          from public_sessions ps
        ),
        session_social as (
          select
            rs.id,
            count(distinct sr.id)::int as reactions
          from repo_sessions rs
          left join session_reaction sr on sr.session_id = rs.id
          group by rs.id
        )
        select
          rs.repo_key as repo,
          count(distinct rs.id)::int as "receiptCount",
          count(distinct rs.user_id)::int as "builderCount",
          coalesce(sum(ss.reactions), 0)::int as "reactionCount",
          max(rs.shared_at) as "latestSharedAt"
        from repo_sessions rs
        left join session_social ss on ss.id = rs.id
        where rs.repo_key is not null
          and rs.repo_key <> ''
          and rs.repo_key ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$'
        group by rs.repo_key
        order by
          count(distinct rs.id) * 2
          + count(distinct rs.user_id)
          + coalesce(sum(ss.reactions), 0) desc,
          max(rs.shared_at) desc
        limit 6
      `),
    ]);

  return {
    stats: firstRowOf<NetworkStats>(statsResult, emptyStats),
    receipts: rowsOf<ReceiptRow>(receiptsResult),
    builders: rowsOf<BuilderRow>(buildersResult),
    stacks: rowsOf<StackRow>(stacksResult),
    repos: rowsOf<RepoRow>(reposResult),
  };
}

export default async function DiscoverPage() {
  let data = emptyData;
  try {
    data = await loadDiscoverData();
  } catch (error) {
    console.error("Failed to load discovery data", error);
  }

  const topReceipt = data.receipts[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#070806] text-zinc-50">
      <SiteNav currentPath="/discover" />

      <main className="flex-1 w-full">
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="relative overflow-hidden rounded-[2rem] border border-lime-300/20 bg-zinc-950 p-5 shadow-[0_28px_120px_rgba(0,0,0,0.55)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(190,242,100,0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(34,197,94,0.16),transparent_30%)]" />
            <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-lime-100">
                  Proof network
                </div>
                <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                  Discover builders shipping with agents right now.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
                  Trending receipts, rising builders, hot stacks, and repos with proof attached.
                  Every link opens a public build receipt, not a marketing claim.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="public receipts" value={formatCount(data.stats.receiptCount)} />
                <StatCard label="builders" value={formatCount(data.stats.builderCount)} />
                <StatCard label="reactions" value={formatCount(data.stats.reactionCount)} />
                <StatCard label="comments" value={formatCount(data.stats.commentCount)} />
              </div>
            </div>
          </div>

          {topReceipt ? (
            <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
              <div className="space-y-6">
                <SectionHeader
                  kicker="Trending receipts"
                  title="What the network is opening"
                  description="Ranked from recent public receipts, reactions, comments, shipped outcomes, and build depth."
                />
                <div className="grid gap-4">
                  {data.receipts.map((receipt, index) => (
                    <ReceiptCard key={receipt.id} receipt={receipt} rank={index + 1} />
                  ))}
                </div>

                <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/75 p-5 sm:p-6">
                  <SectionHeader
                    kicker="Stack heat"
                    title="Tools and frameworks with momentum"
                    description="These tags are appearing in recent public receipts with real engagement."
                    compact
                  />
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.stacks.map((stack) => (
                      <Link
                        key={`${stack.kind}:${stack.tag}`}
                        href={stackHref(stack)}
                        className="group rounded-2xl border border-zinc-800 bg-black/35 p-4 transition hover:-translate-y-0.5 hover:border-lime-300/40 hover:bg-lime-300/[0.06]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            {stack.kind}
                          </span>
                          <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-500">
                            {formatCount(stack.builderCount)} builders
                          </span>
                        </div>
                        <div className="mt-3 text-lg font-semibold text-white group-hover:text-lime-100">
                          {stack.label}
                        </div>
                        <p className="mt-2 text-sm text-zinc-400">
                          {formatCount(stack.receiptCount)} receipts ·{" "}
                          {formatCount(
                            toNumber(stack.reactionCount) + toNumber(stack.commentCount),
                          )}{" "}
                          social signals
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl shadow-black/40">
                  <SectionHeader
                    kicker="Builder radar"
                    title="Follow people shipping"
                    description="Profiles ranked by public receipts, followers, and conversation."
                    compact
                  />
                  <div className="mt-5 space-y-3">
                    {data.builders.map((builder, index) => (
                      <BuilderCard key={builder.id} builder={builder} rank={index + 1} />
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/90 p-5">
                  <SectionHeader
                    kicker="Repo momentum"
                    title="Projects with proof"
                    description="Repositories attached to recent public receipts."
                    compact
                  />
                  <div className="mt-5 space-y-3">
                    {data.repos.map((repo) => (
                      <a
                        key={repo.repo}
                        href={githubRepoUrl(repo.repo)}
                        target="_blank"
                        rel="noreferrer"
                        className="group block rounded-2xl border border-zinc-800 bg-black/35 p-4 transition hover:border-lime-300/40 hover:bg-lime-300/[0.06]"
                      >
                        <div className="text-sm font-semibold text-white group-hover:text-lime-100">
                          {repo.repo}
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          {formatCount(repo.receiptCount)} receipts ·{" "}
                          {formatCount(repo.builderCount)} builders ·{" "}
                          {formatCount(repo.reactionCount)} reactions
                        </p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                          updated <RelativeTime date={repo.latestSharedAt} />
                        </p>
                      </a>
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-[1.75rem] border border-lime-300/25 bg-lime-300 text-zinc-950">
                  <div className="p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-700">
                      Become discoverable
                    </p>
                    <h2 className="mt-3 text-2xl font-black tracking-[-0.05em]">
                      Publish a receipt, earn a slot in the network.
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-800">
                      Import a coding-agent session, review the generated receipt, then publish it
                      to feed, profile, and discovery.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href="/feed"
                        className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-lime-100 transition hover:bg-zinc-800"
                      >
                        Publish from feed
                      </Link>
                      <Link
                        href="/import"
                        className="rounded-full border border-zinc-950/30 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-950/10"
                      >
                        Import session
                      </Link>
                    </div>
                  </div>
                </section>
              </aside>
            </section>
          ) : (
            <EmptyDiscoverState />
          )}
        </section>
      </main>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <Link href="/feed" className="hover:text-zinc-200 transition-colors">
            Feed
          </Link>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur">
      <div className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
        {value}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  description,
  compact = false,
}: {
  kicker: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lime-300/80">
        {kicker}
      </p>
      <h2
        className={
          compact
            ? "mt-2 text-xl font-semibold tracking-[-0.04em] text-white"
            : "mt-2 text-3xl font-semibold tracking-[-0.05em] text-white"
        }
      >
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

function ReceiptCard({ receipt, rank }: { receipt: ReceiptRow; rank: number }) {
  const href = `/u/${receipt.handle}/${receipt.slug}`;
  const title = receiptTitle(receipt);
  const copy = receiptCopy(receipt);
  const url = shareUrl(receipt.handle, receipt.slug, PUBLIC_APP_URL);
  const tweetUrl = tweetIntent(`${title} — proof of work by @${receipt.handle}`, url);

  return (
    <article className="group overflow-hidden rounded-[1.75rem] border border-zinc-800 bg-zinc-950/85 shadow-2xl shadow-black/30 transition hover:-translate-y-0.5 hover:border-lime-300/35">
      <Link href={href} className="block p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-lime-300/30 bg-lime-300/10 text-lg font-black text-lime-200">
            #{rank}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-black/30 px-2.5 py-1 font-mono">
                <ToolIcon name={receipt.tool} size={12} className="text-lime-300" />
                {receipt.tool}
              </span>
              <span>@{receipt.handle}</span>
              <span>·</span>
              <RelativeTime date={receipt.sharedAt} />
            </div>
            <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.05em] text-white group-hover:text-lime-100">
              {title}
            </h3>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-400">{copy}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-100">
                {receiptReason(receipt)}
              </span>
              {isShipped(receipt) && (
                <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  shipped
                </span>
              )}
              {(receipt.linkedRepo || receipt.repo) && (
                <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                  {receipt.linkedRepo || receipt.repo}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-3 border-t border-zinc-900 bg-black/25 text-xs text-zinc-500 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
        <ProofMetric label="events" value={formatCount(receipt.eventCount)} />
        <ProofMetric label="reactions" value={formatCount(receipt.reactions)} />
        <ProofMetric label="comments" value={formatCount(receipt.comments)} />
        <Link
          href={href}
          className="flex items-center justify-center border-l border-zinc-900 px-3 py-3 font-semibold text-zinc-300 transition hover:bg-lime-300/10 hover:text-lime-100"
        >
          open
        </Link>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center justify-center border-l border-zinc-900 px-3 py-3 font-semibold text-zinc-300 transition hover:bg-lime-300/10 hover:text-lime-100 sm:flex"
        >
          share
        </a>
      </div>
    </article>
  );
}

function ProofMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-zinc-900 px-3 py-3 first:border-l-0">
      <div className="text-sm font-semibold text-zinc-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em]">{label}</div>
    </div>
  );
}

function BuilderCard({ builder, rank }: { builder: BuilderRow; rank: number }) {
  return (
    <Link
      href={`/u/${builder.handle}`}
      className="group flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black/35 p-3 transition hover:border-lime-300/40 hover:bg-lime-300/[0.06]"
    >
      <div className="relative h-11 w-11 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900">
        <img
          src={builderAvatar(builder)}
          alt=""
          className="h-full w-full object-cover"
          width={44}
          height={44}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white group-hover:text-lime-100">
            {builderLabel(builder)}
          </span>
          <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-500">
            #{rank}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-zinc-500">@{builder.handle}</p>
        <p className="mt-1 text-xs text-zinc-400">{builderReason(builder)}</p>
      </div>
      <div className="text-right text-[11px] text-zinc-500">
        <div className="font-semibold text-zinc-200">{formatCount(builder.receiptCount)}</div>
        <div>receipts</div>
      </div>
    </Link>
  );
}

function EmptyDiscoverState() {
  return (
    <section className="mt-6 rounded-[1.75rem] border border-zinc-800 bg-zinc-950 p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lime-300/80">
        Discovery is waiting on receipts
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
        Publish the first proof-of-work post.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
        Import a coding-agent session, review the generated receipt, and publish it so builders can
        react, comment, follow, fork, and share it.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/feed"
          className="rounded-full bg-lime-300 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200"
        >
          Open feed
        </Link>
        <Link
          href="/import"
          className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
        >
          Import session
        </Link>
      </div>
    </section>
  );
}
