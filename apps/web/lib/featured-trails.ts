// Hand-curated featured trails for the /learn page.
//
// Phase 0: this is a plain TS module. PR3 will swap to a DB-backed
// `featured_flag` column on trail_session, but the public API exported here
// (getBuckets, getBucket, resolveBucketTrails) should stay stable so the page
// doesn't change shape when that lands.
//
// Editorial rule: each bucket gets 3–6 picks. If a slug here doesn't exist in
// the DB yet (or is no longer public), the resolver just drops it — the bucket
// will render with whatever survives. Don't crash the page over a stale pick.

export type BucketSlug =
  | "debugging-with-agents"
  | "multi-agent-orchestration"
  | "rag-patterns"
  | "refactors-at-scale"
  | "greenfield-builds"
  | "verification-loops";

export interface FeaturedPick {
  /** trail slug (matches trail_session.slug) */
  slug: string;
  /** short editorial blurb — why this trail belongs in this bucket. 1 sentence. */
  blurb: string;
}

export interface Bucket {
  slug: BucketSlug;
  title: string;
  /** rail-style kicker label, all caps */
  kicker: string;
  /** one-line description, builder-to-builder, no marketing tone */
  description: string;
  /** indigo-italic verb treatment hint — what this bucket is about, as a verb */
  verb: string;
  picks: FeaturedPick[];
}

// NOTE: these slugs are placeholders curated against what's currently public on
// trail.dev. If a slug 404s the resolver drops it silently. Audit quarterly.
export const BUCKETS: Bucket[] = [
  {
    slug: "debugging-with-agents",
    title: "Debugging with agents",
    kicker: "DEBUG",
    verb: "trace",
    description:
      "How experienced builders narrow down a bug when the agent owns the loop — repros, hypotheses, and when to take the keyboard back.",
    picks: [
      { slug: "057smo2q", blurb: "Pricing-research bug hunt: 41 events from broken query to root cause." },
    ],
  },
  {
    slug: "multi-agent-orchestration",
    title: "Multi-agent orchestration",
    kicker: "ORCHESTRATE",
    verb: "delegate",
    description:
      "Sessions where one agent drives others — planners spawning workers, parallel branches, handoffs between Claude Code and Codex.",
    picks: [],
  },
  {
    slug: "rag-patterns",
    title: "RAG patterns",
    kicker: "RETRIEVE",
    verb: "ground",
    description:
      "Embeddings, retrieval gates, hybrid search, eval loops. Real sessions, not blog-post diagrams.",
    picks: [],
  },
  {
    slug: "refactors-at-scale",
    title: "Refactors at scale",
    kicker: "REFACTOR",
    verb: "rewire",
    description:
      "Touching dozens of files at once — schema migrations, type-system overhauls, framework upgrades the agent walks through.",
    picks: [],
  },
  {
    slug: "greenfield-builds",
    title: "Greenfield builds",
    kicker: "BUILD",
    verb: "scaffold",
    description:
      "Empty-folder-to-shipped sessions. Watch the first 100 events of a project decide what it's going to be.",
    picks: [],
  },
  {
    slug: "verification-loops",
    title: "Verification loops",
    kicker: "VERIFY",
    verb: "prove",
    description:
      "Tests-first, type-check-first, run-and-read-the-error rhythms. How builders keep the agent honest.",
    picks: [],
  },
];

const BUCKET_BY_SLUG: Record<BucketSlug, Bucket> = Object.fromEntries(
  BUCKETS.map((b) => [b.slug, b]),
) as Record<BucketSlug, Bucket>;

export function getBuckets(): Bucket[] {
  return BUCKETS;
}

export function getBucket(slug: BucketSlug): Bucket | undefined {
  return BUCKET_BY_SLUG[slug];
}

/** Flat list of every slug referenced across all buckets (deduped). */
export function allFeaturedSlugs(): string[] {
  const set = new Set<string>();
  for (const b of BUCKETS) for (const p of b.picks) set.add(p.slug);
  return [...set];
}

/** Look up the editorial blurb for a (bucket, slug) pair. */
export function blurbFor(bucket: BucketSlug, slug: string): string | undefined {
  return BUCKET_BY_SLUG[bucket]?.picks.find((p) => p.slug === slug)?.blurb;
}
