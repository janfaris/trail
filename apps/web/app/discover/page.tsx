import { FollowButton } from "@/components/follow-button";
import { RelativeTime } from "@/components/relative-time";
import { SaveReceiptButton } from "@/components/save-receipt-button";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://gettrail.vercel.app";

export const metadata: Metadata = {
  title: "Find AI builders to follow | Trail",
  description:
    "Find real builders on Trail, follow their profiles, and open the build posts behind their work.",
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
  postKind: string | null;
  handle: string;
  name: string | null;
  image: string | null;
  githubHandle: string | null;
  reactions: unknown;
  comments: unknown;
  score: unknown;
  viewerHasSaved: boolean | null;
};

type BuilderRow = {
  id: string;
  handle: string;
  name: string | null;
  image: string | null;
  githubHandle: string | null;
  location: string | null;
  currentlyBuilding: string | null;
  receiptCount: unknown;
  shippedCount: unknown;
  eventCount: unknown;
  followerCount: unknown;
  reactionCount: unknown;
  commentCount: unknown;
  latestSharedAt: Date;
  isFollowing: boolean | null;
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
  return row.title ?? row.receiptTldr ?? row.summary ?? "Untitled build post";
}

function receiptCopy(row: ReceiptRow): string {
  return (
    row.receiptOutcome ??
    row.receiptTldr ??
    row.summary ??
    "A public Trail build post with decisions, proof links, and conversation."
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
  if (row.postKind === "manual_build") return "native build post";
  return `${formatCount(row.eventCount)} proof events attached`;
}

function builderReason(row: BuilderRow): string {
  const followers = toNumber(row.followerCount);
  const reactions = toNumber(row.reactionCount);
  if (row.currentlyBuilding) return row.currentlyBuilding;
  if (followers > 0) return `${formatCount(followers)} followers watching`;
  if (reactions > 0) return `${formatCount(reactions)} build reactions`;
  return `${formatCount(row.shippedCount)} shipped builds`;
}

function stackHref(row: StackRow): string {
  void row;
  return "/discover";
}

function githubRepoUrl(repo: string): string {
  return `https://github.com/${repo.replace(/^(https?:\/\/)?github\.com\//, "")}`;
}

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

async function loadViewerId(): Promise<string | null> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

async function loadDiscoverData(viewerId: string | null): Promise<DiscoverData> {
  const { db } = await import("@/db/client");

  const publicSessions = sql`
    select ts.*
    from trail_session ts
    join "user" u on u.id = ts.user_id
    where ts.visibility = 'public'
      and ts.shared_at is not null
      and (ts.event_count > 0 or ts.post_kind = 'manual_build')
      and u.handle is not null
      and u.handle <> ''
  `;

  const [statsResult, receiptsResult, buildersResult, stacksResult, reposResult] =
    await Promise.all([
      db.execute(sql`
        with public_sessions as (${publicSessions}),
        public_builders as (
          select id
          from "user"
          where handle is not null
            and handle <> ''
        )
        select
          (select count(distinct id)::int from public_sessions) as "receiptCount",
          (select count(distinct id)::int from public_builders) as "builderCount",
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
          ps.post_kind as "postKind",
          u.handle,
          u.name,
          u.image,
          u.github_handle as "githubHandle",
          count(distinct sr.id)::int as reactions,
          count(distinct sc.id)::int as comments,
          exists (
            select 1
            from saved_receipt sv
            where sv.session_id = ps.id
              and sv.user_id = ${viewerId}
          ) as "viewerHasSaved",
          (
            ln(greatest(
              ps.event_count,
              case when ps.post_kind = 'manual_build' then 1 else 0 end
            ) + 1)
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
          ps.post_kind,
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
            u.location,
            u.currently_building as "currentlyBuilding",
            count(ps.id)::int as "receiptCount",
            (count(*) filter (
              where ps.receipt_status = 'shipped' or ps.outcome = 'shipped'
            ))::int as "shippedCount",
            coalesce(sum(ps.event_count), 0)::int as "eventCount",
            coalesce(sum(ss.reactions), 0)::int as "reactionCount",
            coalesce(sum(ss.comments), 0)::int as "commentCount",
            coalesce(max(ps.shared_at), u.created_at at time zone 'UTC') as "latestSharedAt"
          from "user" u
          left join public_sessions ps on ps.user_id = u.id
          left join session_social ss on ss.id = ps.id
          where u.handle is not null
            and u.handle <> ''
            and (${viewerId}::text is null or u.id <> ${viewerId})
          group by
            u.id,
            u.handle,
            u.name,
            u.image,
            u.github_handle,
            u.location,
            u.currently_building,
            u.created_at
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
          br.location,
          br."currentlyBuilding",
          br."receiptCount",
          br."shippedCount",
          br."eventCount",
          coalesce(f."followerCount", 0)::int as "followerCount",
          br."reactionCount",
          br."commentCount",
          br."latestSharedAt",
          coalesce(vf.follower_id is not null, false) as "isFollowing"
        from builder_receipts br
        left join followers f on f.following_id = br.id
        left join follow vf
          on vf.following_id = br.id
         and vf.follower_id = ${viewerId}
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
  const viewerId = await loadViewerId();
  let data = emptyData;
  try {
    data = await loadDiscoverData(viewerId);
  } catch (error) {
    console.error("Failed to load discovery data", error);
  }

  const hasBuilders = data.builders.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-deep)] text-zinc-50">
      <SiteNav currentPath="/discover" />

      <main className="w-full flex-1">
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="relative overflow-hidden rounded-[2rem] bg-zinc-950/86 p-5 shadow-[var(--trail-shadow-border)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.1),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_42%)]" />
            <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)]/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-text)] shadow-[0_0_0_1px_rgba(167,243,0,0.18)]">
                  Builder directory
                </div>
                <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                  Find real builders to follow.
                </h1>
                <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-zinc-300">
                  This is the people screen: open profiles, follow builders, and use their public
                  build posts as proof when they have shipped something.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="builders" value={formatCount(data.stats.builderCount)} />
                <StatCard label="build posts" value={formatCount(data.stats.receiptCount)} />
                <StatCard label="reactions" value={formatCount(data.stats.reactionCount)} />
                <StatCard label="comments" value={formatCount(data.stats.commentCount)} />
              </div>
            </div>
          </div>

          {hasBuilders ? (
            <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
              <div className="space-y-6">
                <SectionHeader
                  kicker="People"
                  title="Builders you can follow now"
                  description="Real Trail profiles. A builder can appear here even before publishing their first clean build post."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.builders.map((builder, index) => (
                    <BuilderCard
                      key={builder.id}
                      builder={builder}
                      rank={index + 1}
                      viewerId={viewerId}
                    />
                  ))}
                </div>

                {data.receipts.length > 0 ? (
                  <section className="rounded-[1.75rem] bg-zinc-950/72 p-5 shadow-[var(--trail-shadow-border)] sm:p-6">
                    <SectionHeader
                      kicker="Recent proof"
                      title="Build posts behind the network"
                      description="Optional context from public posts. The main action here is still to find and follow people."
                      compact
                    />
                    <div className="mt-5 grid gap-4">
                      {data.receipts.slice(0, 4).map((receipt, index) => (
                        <ReceiptCard
                          key={receipt.id}
                          receipt={receipt}
                          rank={index + 1}
                          viewerId={viewerId}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="rounded-[1.75rem] border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] p-5 shadow-[var(--trail-shadow-border)] sm:p-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
                      Clean slate
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
                      No public build posts yet.
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      Users are still here. New posts created from the simpler composer will fill
                      this section without bringing back old CLI logs.
                    </p>
                    <Link
                      href="/create"
                      className="mt-5 inline-flex min-h-10 items-center rounded-full bg-[var(--trail-green)] px-4 text-sm font-semibold text-zinc-950 transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"
                    >
                      Post first clean build
                    </Link>
                  </section>
                )}

                {data.stacks.length > 0 ? (
                  <section className="rounded-[1.75rem] bg-zinc-950/72 p-5 shadow-[var(--trail-shadow-border)] sm:p-6">
                    <SectionHeader
                      kicker="Shared interests"
                      title="Tools and frameworks builders use"
                      description="Use these as context for who to follow, not as a separate product surface."
                      compact
                    />
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {data.stacks.map((stack) => (
                        <Link
                          key={`${stack.kind}:${stack.tag}`}
                          href={stackHref(stack)}
                          className="group rounded-2xl bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] transition-[background-color,box-shadow] hover:bg-black/42 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                              {stack.kind}
                            </span>
                            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                              {formatCount(stack.builderCount)} builders
                            </span>
                          </div>
                          <div className="mt-3 text-lg font-semibold text-white group-hover:text-lime-100">
                            {stack.label}
                          </div>
                          <p className="mt-2 text-sm text-zinc-400">
                            {formatCount(stack.receiptCount)} posts ·{" "}
                            {formatCount(
                              toNumber(stack.reactionCount) + toNumber(stack.commentCount),
                            )}{" "}
                            social signals
                          </p>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                <section className="rounded-[1.75rem] bg-zinc-950/82 p-5 shadow-[var(--trail-shadow-border)]">
                  <SectionHeader
                    kicker="How it works"
                    title="Follow people first"
                    description="Builders is a directory. Posts, stacks, and repos are only supporting signals."
                    compact
                  />
                  <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-400">
                    <p>1. Open a profile to see who they are and what they are building.</p>
                    <p>2. Follow them so their future posts land in your feed.</p>
                    <p>3. Publish your own clean build post to appear here.</p>
                  </div>
                </section>

                {data.repos.length > 0 ? (
                  <section className="rounded-[1.75rem] bg-zinc-950/82 p-5 shadow-[var(--trail-shadow-border)]">
                    <SectionHeader
                      kicker="Repo proof"
                      title="Projects builders link"
                      description="Repositories attached to recent public build posts."
                      compact
                    />
                    <div className="mt-5 space-y-3">
                      {data.repos.map((repo) => (
                        <a
                          key={repo.repo}
                          href={githubRepoUrl(repo.repo)}
                          target="_blank"
                          rel="noreferrer"
                          className="group block rounded-2xl bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] transition-[background-color,box-shadow] hover:bg-black/42 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
                        >
                          <div className="text-sm font-semibold text-white group-hover:text-lime-100">
                            {repo.repo}
                          </div>
                          <p className="mt-2 text-xs text-zinc-500">
                            {formatCount(repo.receiptCount)} posts ·{" "}
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
                ) : null}

                <section className="overflow-hidden rounded-[1.75rem] bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_0_0_1px_rgba(167,243,0,0.22),0_20px_56px_rgba(0,0,0,0.26)]">
                  <div className="p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-700">
                      Become discoverable
                    </p>
                    <h2 className="mt-3 text-2xl font-black tracking-[-0.05em]">
                      Ship one clean post. Show up as a builder.
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-800">
                      The new composer is the fast path: write what changed, add proof if useful,
                      and publish to your profile.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href="/create"
                        className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 text-sm font-semibold text-lime-100 transition-[background-color,transform] hover:bg-zinc-800 active:scale-[0.96]"
                      >
                        Post a build
                      </Link>
                      <Link
                        href="/feed"
                        className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold text-zinc-950 shadow-[0_0_0_1px_rgba(9,9,11,0.26)] transition-[background-color,transform] hover:bg-zinc-950/10 active:scale-[0.96]"
                      >
                        Browse feed
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

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <Link href="/feed" className="transition-[color] hover:text-zinc-200">
            Feed
          </Link>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/34 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] backdrop-blur">
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

function ReceiptCard({
  receipt,
  rank,
  viewerId,
}: {
  receipt: ReceiptRow;
  rank: number;
  viewerId: string | null;
}) {
  const href = `/u/${receipt.handle}/${receipt.slug}`;
  const forkHref = `${href}/fork`;
  const title = receiptTitle(receipt);
  const copy = receiptCopy(receipt);
  const url = shareUrl(receipt.handle, receipt.slug, PUBLIC_APP_URL);
  const tweetUrl = tweetIntent(`${title} — build post by @${receipt.handle}`, url);

  return (
    <article className="group overflow-hidden rounded-[1.75rem] bg-zinc-950/84 shadow-[var(--trail-shadow-border)] transition-[box-shadow] hover:shadow-[var(--trail-shadow-border-hover)]">
      <Link href={href} className="block p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-lime-300/10 text-lg font-black text-lime-200 shadow-[0_0_0_1px_rgba(167,243,0,0.18)]">
            #{rank}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 font-mono text-zinc-300">
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
              <span className="rounded-full bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-100 shadow-[0_0_0_1px_rgba(167,243,0,0.16)]">
                {receiptReason(receipt)}
              </span>
              {isShipped(receipt) && (
                <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100 shadow-[0_0_0_1px_rgba(110,231,183,0.16)]">
                  shipped
                </span>
              )}
              {(receipt.linkedRepo || receipt.repo) && (
                <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">
                  {receipt.linkedRepo || receipt.repo}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-3 border-t border-white/10 bg-black/25 text-xs text-zinc-500 sm:grid-cols-7">
        <ProofMetric label="proof events" value={formatCount(receipt.eventCount)} />
        <ProofMetric label="reactions" value={formatCount(receipt.reactions)} />
        <ProofMetric label="comments" value={formatCount(receipt.comments)} />
        <SaveReceiptButton
          sessionId={receipt.id}
          initialSaved={Boolean(receipt.viewerHasSaved)}
          signedIn={viewerId !== null}
          signInHref={signInHref(href)}
          className="flex min-h-10 items-center justify-center rounded-none border-0 border-l border-white/10 px-3 py-3 text-xs font-semibold normal-case tracking-normal text-zinc-300 transition-[background-color,color] hover:bg-lime-300/10 hover:text-lime-100"
          savedLabel="saved"
          unsavedLabel="save"
        />
        <Link
          href={forkHref}
          className="flex min-h-10 items-center justify-center border-l border-white/10 px-3 py-3 font-semibold text-zinc-300 transition-[background-color,color] hover:bg-lime-300/10 hover:text-lime-100"
        >
          fork
        </Link>
        <Link
          href={href}
          className="flex min-h-10 items-center justify-center border-l border-white/10 px-3 py-3 font-semibold text-zinc-300 transition-[background-color,color] hover:bg-lime-300/10 hover:text-lime-100"
        >
          open
        </Link>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden min-h-10 items-center justify-center border-l border-white/10 px-3 py-3 font-semibold text-zinc-300 transition-[background-color,color] hover:bg-lime-300/10 hover:text-lime-100 sm:flex"
        >
          share
        </a>
      </div>
    </article>
  );
}

function ProofMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-white/10 px-3 py-3 first:border-l-0">
      <div className="text-sm font-semibold text-zinc-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em]">{label}</div>
    </div>
  );
}

function BuilderCard({
  builder,
  rank,
  viewerId,
}: {
  builder: BuilderRow;
  rank: number;
  viewerId: string | null;
}) {
  const buildCount = toNumber(builder.receiptCount);
  const followerCount = toNumber(builder.followerCount);
  const signalCount = toNumber(builder.reactionCount) + toNumber(builder.commentCount);

  return (
    <article className="group rounded-[1.5rem] bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] transition-[background-color,box-shadow] hover:bg-black/42 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]">
      <div className="flex items-start gap-3">
        <Link
          href={`/u/${builder.handle}`}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-900 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
        >
          <img
            src={builderAvatar(builder)}
            alt=""
            className="h-full w-full object-cover"
            width={48}
            height={48}
          />
        </Link>
        <Link href={`/u/${builder.handle}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold tracking-[-0.03em] text-white group-hover:text-lime-100">
              {builderLabel(builder)}
            </span>
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-500">
              #{rank}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            @{builder.handle}
            {builder.location ? <span> · {builder.location}</span> : null}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
            {builderReason(builder)}
          </p>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/10 text-center">
        <BuilderMetric label="posts" value={formatCount(buildCount)} />
        <BuilderMetric label="followers" value={formatCount(followerCount)} />
        <BuilderMetric label="signals" value={formatCount(signalCount)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
        <Link
          href={`/u/${builder.handle}`}
          className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-[background-color,color,transform] hover:bg-white/[0.06] hover:text-white active:scale-[0.96]"
        >
          Open profile
        </Link>
        {viewerId ? (
          <FollowButton
            targetUserId={builder.id}
            initialFollowing={builder.isFollowing === true}
            className="min-h-8 px-3 text-[10px]"
          />
        ) : (
          <Link
            href={signInHref(`/u/${builder.handle}`)}
            className="inline-flex min-h-10 items-center rounded-full bg-lime-300 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-950 transition-[background-color,transform] hover:bg-lime-200 active:scale-[0.96]"
          >
            Follow
          </Link>
        )}
      </div>
    </article>
  );
}

function BuilderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950/80 px-2 py-2">
      <div className="text-sm font-semibold text-zinc-100">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
    </div>
  );
}

function EmptyDiscoverState() {
  return (
    <section className="mt-6 rounded-[1.75rem] bg-zinc-950/84 p-10 text-center shadow-[var(--trail-shadow-border)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-lime-300/80">
        Builders is waiting on profiles
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
        Sign in to claim the first builder profile.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
        Once users have handles, they appear here even before the first clean build post. Posts are
        proof; people are the point of this screen.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/feed"
          className="inline-flex min-h-10 items-center rounded-full bg-lime-300 px-5 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-lime-200 active:scale-[0.96]"
        >
          Open feed
        </Link>
        <Link
          href="/create"
          className="inline-flex min-h-10 items-center rounded-full px-5 text-sm font-semibold text-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[background-color,box-shadow,transform] hover:bg-zinc-900 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.22)] active:scale-[0.96]"
        >
          Post a build
        </Link>
      </div>
    </section>
  );
}
