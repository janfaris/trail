// DB loaders for the public Tools & Frameworks entity pages. Thin layer over
// the `session_tag` projection JOINed to public `trail_session` rows; all
// ranking/summary shaping lives in the pure helpers in lib/entity-tags.ts.
//
// Explicit public sharing is enforced here (ts.visibility = 'public' and
// ts.shared_at is not null) rather than denormalized onto session_tag, so these
// queries are the trust boundary for what the public pages may surface.

import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { cache } from "react";
import {
  type BuilderRowInput,
  type EntityKind,
  type EntityStat,
  type RankableEntitySession,
  rankEntitySessions,
  topBuilders,
} from "./entity-tags";

/** neon-http returns `{ rows }`; older shapes return the array directly. */
function rowsOf<T>(res: unknown): T[] {
  const wrapped = (res as { rows?: T[] }).rows;
  return wrapped ?? (res as T[]);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

/**
 * Aggregate every entity of `kind` over public sessions: distinct session and
 * builder counts plus shipped count. `mode()` picks the most frequent stored
 * label so multi-variant labels (Next.js vs NextJS) stay stable.
 */
export async function loadEntityIndex(kind: EntityKind): Promise<EntityStat[]> {
  const res = await db.execute<{
    tag: string;
    label: string | null;
    sessions: number | string;
    builders: number | string;
    shipped: number | string;
  }>(sql`
    SELECT
      st.tag AS tag,
      mode() WITHIN GROUP (ORDER BY st.label) AS label,
      count(DISTINCT ts.id) AS sessions,
      count(DISTINCT ts.user_id) AS builders,
      count(DISTINCT ts.id) FILTER (WHERE ts.outcome = 'shipped') AS shipped
    FROM session_tag st
    JOIN trail_session ts
      ON ts.id = st.session_id
     AND ts.visibility = 'public'
     AND ts.shared_at IS NOT NULL
    WHERE st.kind = ${kind}
    GROUP BY st.tag
  `);
  return rowsOf<{
    tag: string;
    label: string | null;
    sessions: number | string;
    builders: number | string;
    shipped: number | string;
  }>(res).map((r) => ({
    tag: r.tag,
    label: r.label,
    sessions: num(r.sessions),
    builders: num(r.builders),
    shipped: num(r.shipped),
  }));
}

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------

export interface EntitySessionRow extends RankableEntitySession {
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  eventCount: number;
  durationSeconds: number | null;
  handle: string | null;
  name: string | null;
  image: string | null;
}

export interface EntityDetail {
  slug: string;
  label: string | null;
  summary: {
    total: number;
    shipped: number;
    abandoned: number;
    rabbithole: number;
    unknown: number;
    shippedRate: number;
  };
  builders: number;
  /** Ranked, display-capped session list (see SESSION_CAP). */
  sessions: EntitySessionRow[];
  topBuilders: ReturnType<typeof topBuilders>;
  related: { kind: EntityKind; tag: string; label: string | null; sessions: number }[];
}

/** Display cap on the per-entity session list. Stats below are full-corpus. */
const SESSION_CAP = 200;

/**
 * Load one entity. Returns null when no public session carries the tag (the
 * route then renders a 404, which is better for SEO than a thin/empty page).
 * Header stats are exact over the whole public corpus; the session list and
 * top-builders rollup operate on the capped, ranked slice.
 */
/**
 * Loads the full detail payload for one entity. Wrapped in React `cache()` so
 * the generateMetadata + page-render calls within a single request share one
 * result instead of firing the 3 sequential queries twice.
 */
export const loadEntityDetail = cache(loadEntityDetailImpl);

async function loadEntityDetailImpl(kind: EntityKind, slug: string): Promise<EntityDetail | null> {
  const statsRes = await db.execute<{
    sessions: number | string;
    builders: number | string;
    shipped: number | string;
    abandoned: number | string;
    rabbithole: number | string;
    label: string | null;
  }>(sql`
    SELECT
      count(DISTINCT ts.id) AS sessions,
      count(DISTINCT ts.user_id) AS builders,
      count(DISTINCT ts.id) FILTER (WHERE ts.outcome = 'shipped') AS shipped,
      count(DISTINCT ts.id) FILTER (WHERE ts.outcome = 'abandoned') AS abandoned,
      count(DISTINCT ts.id) FILTER (WHERE ts.outcome = 'rabbithole') AS rabbithole,
      mode() WITHIN GROUP (ORDER BY st.label) AS label
    FROM session_tag st
    JOIN trail_session ts
      ON ts.id = st.session_id
     AND ts.visibility = 'public'
     AND ts.shared_at IS NOT NULL
    WHERE st.kind = ${kind} AND st.tag = ${slug}
  `);
  const stats = rowsOf<{
    sessions: number | string;
    builders: number | string;
    shipped: number | string;
    abandoned: number | string;
    rabbithole: number | string;
    label: string | null;
  }>(statsRes)[0];

  const total = num(stats?.sessions);
  if (!stats || total === 0) return null;

  const shipped = num(stats.shipped);
  const abandoned = num(stats.abandoned);
  const rabbithole = num(stats.rabbithole);

  const sessionsRes = await db.execute<EntitySessionRaw>(sql`
    SELECT
      ts.id AS id,
      ts.slug AS slug,
      ts.title AS title,
      ts.summary AS summary,
      ts.tool AS tool,
      ts.outcome AS outcome,
      ts.receipt_status AS "receiptStatus",
      ts.event_count AS "eventCount",
      ts.duration_seconds AS "durationSeconds",
      ts.started_at AS "startedAt",
      ts.shared_at AS "sharedAt",
      u.handle AS handle,
      u.name AS name,
      u.image AS image,
      COALESCE(rx.positive, 0) AS "positiveReactions",
      COALESCE(rx.negative, 0) AS "negativeReactions"
    FROM session_tag st
    JOIN trail_session ts
      ON ts.id = st.session_id
     AND ts.visibility = 'public'
     AND ts.shared_at IS NOT NULL
    JOIN "user" u ON u.id = ts.user_id
    LEFT JOIN (
      SELECT
        session_id,
        count(*) FILTER (WHERE kind IN ('worked', 'worked-verified')) AS positive,
        count(*) FILTER (WHERE kind IN ('needs-tweak', 'broken')) AS negative
      FROM session_reaction
      GROUP BY session_id
    ) rx ON rx.session_id = ts.id
    WHERE st.kind = ${kind} AND st.tag = ${slug}
    ORDER BY ts.shared_at DESC
    LIMIT ${SESSION_CAP}
  `);

  const sessionRows: EntitySessionRow[] = rowsOf<EntitySessionRaw>(sessionsRes).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    tool: r.tool,
    outcome: r.outcome,
    receiptStatus: r.receiptStatus,
    eventCount: num(r.eventCount),
    durationSeconds: r.durationSeconds == null ? null : num(r.durationSeconds),
    startedAt: r.startedAt,
    sharedAt: r.sharedAt,
    handle: r.handle,
    name: r.name,
    image: r.image,
    positiveReactions: num(r.positiveReactions),
    negativeReactions: num(r.negativeReactions),
  }));

  const ranked = rankEntitySessions(sessionRows);
  const builderInput: BuilderRowInput[] = sessionRows.map((r) => ({
    handle: r.handle,
    name: r.name,
    image: r.image,
    outcome: r.outcome,
  }));

  const relatedRes = await db.execute<{
    kind: EntityKind;
    tag: string;
    label: string | null;
    sessions: number | string;
  }>(sql`
    SELECT
      st2.kind AS kind,
      st2.tag AS tag,
      mode() WITHIN GROUP (ORDER BY st2.label) AS label,
      count(DISTINCT ts.id) AS sessions
    FROM session_tag st1
    JOIN trail_session ts
      ON ts.id = st1.session_id
     AND ts.visibility = 'public'
     AND ts.shared_at IS NOT NULL
    JOIN session_tag st2 ON st2.session_id = ts.id
    WHERE st1.kind = ${kind}
      AND st1.tag = ${slug}
      AND st2.kind IN ('tool', 'framework')
      AND NOT (st2.kind = ${kind} AND st2.tag = ${slug})
    GROUP BY st2.kind, st2.tag
    ORDER BY sessions DESC, st2.tag ASC
    LIMIT 12
  `);
  const related = rowsOf<{
    kind: EntityKind;
    tag: string;
    label: string | null;
    sessions: number | string;
  }>(relatedRes).map((r) => ({
    kind: r.kind,
    tag: r.tag,
    label: r.label,
    sessions: num(r.sessions),
  }));

  return {
    slug,
    label: stats.label,
    summary: {
      total,
      shipped,
      abandoned,
      rabbithole,
      unknown: Math.max(0, total - shipped - abandoned - rabbithole),
      shippedRate: total ? shipped / total : 0,
    },
    builders: num(stats.builders),
    sessions: ranked,
    topBuilders: topBuilders(builderInput),
    related,
  };
}

type EntitySessionRaw = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  outcome: string | null;
  receiptStatus: string | null;
  eventCount: number | string;
  durationSeconds: number | string | null;
  startedAt: string | Date;
  sharedAt: string | Date | null;
  handle: string | null;
  name: string | null;
  image: string | null;
  positiveReactions: number | string;
  negativeReactions: number | string;
};

// ---------------------------------------------------------------------------
// Sitemap support
// ---------------------------------------------------------------------------

/** Distinct public entity slugs of both kinds, for sitemap generation. */
export async function loadEntitySlugs(): Promise<{ kind: EntityKind; tag: string }[]> {
  const res = await db.execute<{ kind: EntityKind; tag: string }>(sql`
    SELECT DISTINCT st.kind AS kind, st.tag AS tag
    FROM session_tag st
    JOIN trail_session ts
      ON ts.id = st.session_id
     AND ts.visibility = 'public'
     AND ts.shared_at IS NOT NULL
    WHERE st.kind IN ('tool', 'framework')
  `);
  return rowsOf<{ kind: EntityKind; tag: string }>(res).map((r) => ({ kind: r.kind, tag: r.tag }));
}

/**
 * Public builder profiles for the sitemap: handles of users with at least one
 * public, shared post. We exclude post-less handles to avoid thin pages that
 * hurt SEO. Capped for sitemap size sanity.
 */
export async function loadPublicProfileSlugs(): Promise<{ handle: string; lastSharedAt: Date }[]> {
  const res = await db.execute<{ handle: string; last_shared_at: string | Date }>(sql`
    SELECT u.handle AS handle, max(ts.shared_at) AS last_shared_at
    FROM "user" u
    JOIN trail_session ts
      ON ts.user_id = u.id
     AND ts.visibility = 'public'
     AND ts.shared_at IS NOT NULL
    WHERE u.handle IS NOT NULL
    GROUP BY u.handle
    ORDER BY max(ts.shared_at) DESC
    LIMIT 10000
  `);
  return rowsOf<{ handle: string; last_shared_at: string | Date }>(res).map((r) => ({
    handle: r.handle,
    lastSharedAt: new Date(r.last_shared_at),
  }));
}

/**
 * Public post URLs for the sitemap: every publicly shared session paired with
 * its author handle. Capped for sitemap size sanity.
 */
export async function loadPublicPostSlugs(): Promise<
  { handle: string; slug: string; lastModified: Date }[]
> {
  const res = await db.execute<{
    handle: string;
    slug: string;
    last_modified: string | Date;
  }>(sql`
    SELECT u.handle AS handle, ts.slug AS slug,
      COALESCE(ts.shared_at, ts.started_at) AS last_modified
    FROM trail_session ts
    JOIN "user" u ON u.id = ts.user_id
    WHERE ts.visibility = 'public'
      AND ts.shared_at IS NOT NULL
      AND u.handle IS NOT NULL
    ORDER BY ts.shared_at DESC
    LIMIT 30000
  `);
  return rowsOf<{ handle: string; slug: string; last_modified: string | Date }>(res).map((r) => ({
    handle: r.handle,
    slug: r.slug,
    lastModified: new Date(r.last_modified),
  }));
}
