import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import type { ReceiptAiReview } from "../lib/receipt-ai-review-types";

export type RadarSignalMetrics = {
  retweet_count?: number;
  reply_count?: number;
  like_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
};

export type RadarFetchRunFailure = {
  sourceHandle?: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
};

// better-auth core tables (per https://better-auth.com/docs/concepts/database#core-schema)
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // trail-specific
    handle: text("handle").unique(), // github login, used in /u/[handle]
    bio: text("bio"),
    location: text("location"),
    currentlyBuilding: text("currently_building"),
    xHandle: text("x_handle"),
    githubHandle: text("github_handle"),
    linkedinHandle: text("linkedin_handle"),
    website: text("website"),
    // Task 7 — Stripe paywall. 'free' = 3 public receipts, no private.
    // 'pro' = unlimited public + private. Filled by Stripe webhook.
    plan: text("plan").notNull().default("free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    // Layer 2 spend audit gate. Opt-in is required before any prompt text or
    // tool_call args leave the database for an LLM call, even though they're
    // anonymized first. Default false on every user — Pro plan alone is not
    // consent.
    spendAuditOptIn: boolean("spend_audit_opt_in").notNull().default(false),
    // Privileged role for internal tooling (e.g. /admin/radar). 'user' for
    // everyone by default; set to 'admin' manually for trusted operators.
    role: text("role").notNull().default("user"),
    // First-run onboarding completion (claim handle + guided first post). Null
    // means the user has not finished /welcome yet; the sign-in flow routes them
    // there once.
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  },
  (t) => ({
    handleIdx: uniqueIndex("user_handle_idx").on(t.handle),
  }),
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// trail domain tables
export const trailSession = pgTable(
  "trail_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    tool: text("tool").notNull(),
    // Rebuild pivot: legacy/imported agent sessions remain `agent_session`.
    // No-install social posts use `manual_build` so feed/detail/paywall code can
    // treat them as build posts without mistaking them for generated receipts.
    postKind: text("post_kind").notNull().default("agent_session"),
    repo: text("repo"),
    summary: text("summary"),
    title: text("title"),
    eventCount: integer("event_count").notNull().default(0),
    isFeatured: boolean("is_featured").notNull().default(false),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    // text-embedding-3-small = 1536 dims. HNSW index enables fast cosine
    // similarity search.
    embedding: vector("embedding", { dimensions: 1536 }),
    aiExplanation: text("ai_explanation"),
    aiExplanationGeneratedAt: timestamp("ai_explanation_generated_at"),
    recipeTldr: text("recipe_tldr"),
    recipeOutcome: text("recipe_outcome"),
    recipeKeyPromptIdxs: jsonb("recipe_key_prompt_idxs").$type<number[]>(),
    recipeHighlightIdxs: jsonb("recipe_highlight_idxs").$type<number[]>(),
    recipeGeneratedAt: timestamp("recipe_generated_at"),
    languages: jsonb("languages").$type<Record<string, number>>(),
    durationSeconds: integer("duration_seconds"),
    toolCallCounts: jsonb("tool_call_counts").$type<Record<string, number>>(),
    distinctFiles: integer("distinct_files"),
    promptCount: integer("prompt_count"),
    failedToolCalls: integer("failed_tool_calls"),
    // Phase 0 trust: visibility gates the public listing. 'public' is the
    // happy path; 'pending' is held for owner confirmation (LLM PII flag);
    // 'private' is owner-hidden; 'redacted' is post-publish strike.
    visibility: text("visibility").notNull().default("public"),
    pendingReviewReasons: jsonb("pending_review_reasons").$type<string[]>(),
    redactedAt: timestamp("redacted_at"),
    // Phase 1 taxonomy — LLM-extracted facets surfaced at /learn.
    toolsUsed: jsonb("tools_used").$type<string[]>(),
    frameworks: jsonb("frameworks").$type<string[]>(),
    taskType: text("task_type"), // "onboarding"|"debugging"|"migration"|"spike"|"shipped"|"refactor"|"research"|"other"
    models: jsonb("models").$type<string[]>(),
    outcome: text("outcome"), // "shipped"|"abandoned"|"rabbithole"|"unknown"
    // Phase 2 — GitHub linkage (autodetected at record-time from git remote).
    linkedPrUrl: text("linked_pr_url"), // https://github.com/<owner>/<repo>/pull/<n>
    linkedCommitSha: text("linked_commit_sha"),
    linkedRepo: text("linked_repo"), // <owner>/<repo>
    // Phase 2 receipts — set when verifyShipped() confirms linkedCommitSha
    // is reachable from the default branch of linkedRepo.
    receiptVerifiedAt: timestamp("receipt_verified_at"),
    receiptVerifiedSha: text("receipt_verified_sha"),
    // Task 4 — receipt generation pipeline. LLM-generated client-facing copy
    // bound to the tone spec at apps/web/prompts/receipt-tone-spec.md.
    receiptOutcome: text("receipt_outcome"),
    receiptTldr: text("receipt_tldr"),
    receiptDecisionSummary: jsonb("receipt_decision_summary").$type<string[]>(),
    receiptChangedFiles: jsonb("receipt_changed_files").$type<string[]>(),
    receiptVerification: jsonb("receipt_verification").$type<{
      shipped: boolean;
      sha: string | null;
      repo: string | null;
      checkedAt: string;
      reason?: string;
      matchedBy?: string | null;
      defaultBranch?: string | null;
      private?: boolean | null;
    }>(),
    receiptValidatorWarnings: jsonb("receipt_validator_warnings").$type<string[]>(),
    receiptGeneratedAt: timestamp("receipt_generated_at"),
    // 'shipped' | 'draft' | 'unverified'. Mirrors verifyShipped() output.
    receiptStatus: text("receipt_status"),
    receiptAiReview: jsonb("receipt_ai_review").$type<ReceiptAiReview>(),
    receiptAiReviewGeneratedAt: timestamp("receipt_ai_review_generated_at"),
    receiptAiReviewModel: text("receipt_ai_review_model"),
    receiptAiReviewError: text("receipt_ai_review_error"),
    manualProofNote: text("manual_proof_note"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedTokens: integer("cached_tokens"),
    modelPriceSnapshot: jsonb("model_price_snapshot").$type<{
      model: string;
      inUsdPerMtok: number;
      outUsdPerMtok: number;
      capturedAt: string;
    }>(),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
    costAttributedToPr: boolean("cost_attributed_to_pr").notNull().default(false),
  },
  (t) => ({
    userSlugIdx: uniqueIndex("trail_session_user_slug_idx").on(t.userId, t.slug),
    userIdx: index("trail_session_user_idx").on(t.userId),
  }),
);

export const event = pgTable(
  "event",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    kind: text("kind").notNull(),
    at: timestamp("at").notNull(),
    data: jsonb("data").notNull(),
    // Week 0 cost-per-PR pivot. Per-event token + model capture for
    // assistant turns. Older CLI clients leave these NULL (the route never
    // coerces missing values to 0). Kept split (creation vs read) because
    // Anthropic prices them differently — collapsing them here would lose
    // information needed by future cost calc. trail_session aggregates
    // them as a single cached_tokens sum for the receipt header.
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheCreationInputTokens: integer("cache_creation_input_tokens"),
    cacheReadInputTokens: integer("cache_read_input_tokens"),
    model: text("model"),
  },
  (t) => ({
    sessionIdx: index("event_session_idx").on(t.sessionId, t.idx),
  }),
);

export const buildPostLink = pgTable(
  "build_post_link",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // github | x | demo | website | other
    url: text("url").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    sessionKindIdx: index("build_post_link_session_kind_idx").on(t.sessionId, t.kind),
  }),
);

// AI Builder Radar turns curated X/news signals into claims the Trail network can
// verify with public receipts. Signals stay explicitly unverified until linked to proof.
export const radarSignal = pgTable(
  "radar_signal",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull().default("x"),
    sourceHandle: text("source_handle").notNull(),
    sourceName: text("source_name"),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    text: text("text").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    whyBuildersCare: text("why_builders_care").notNull(),
    testPrompt: text("test_prompt").notNull(),
    category: text("category").notNull().default("other"),
    status: text("status").notNull().default("unverified"),
    score: numeric("score", { precision: 10, scale: 2 }).notNull().default(sql`0`),
    metrics: jsonb("metrics").$type<RadarSignalMetrics>().notNull().default(sql`'{}'::jsonb`),
    entities: jsonb("entities")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    externalIdx: uniqueIndex("radar_signal_source_external_idx").on(t.source, t.externalId),
    publishedIdx: index("radar_signal_published_idx").on(t.publishedAt),
    categoryPublishedIdx: index("radar_signal_category_published_idx").on(
      t.category,
      t.publishedAt,
    ),
    sourcePublishedIdx: index("radar_signal_source_published_idx").on(
      t.sourceHandle,
      t.publishedAt,
    ),
    scorePublishedIdx: index("radar_signal_score_published_idx").on(t.score, t.publishedAt),
    categoryCheck: check(
      "radar_signal_category_check",
      sql`${t.category} IN ('model_release', 'benchmark', 'framework_update', 'tool_workflow', 'rumor', 'security', 'research', 'funding', 'tutorial', 'other')`,
    ),
    statusCheck: check(
      "radar_signal_status_check",
      sql`${t.status} IN ('unverified', 'verified', 'dismissed')`,
    ),
  }),
);

export const radarFetchRun = pgTable(
  "radar_fetch_run",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull().default("x"),
    trigger: text("trigger").notNull().default("cron"),
    status: text("status").notNull().default("running"),
    sourcesCount: integer("sources_count").notNull().default(0),
    fetchedCount: integer("fetched_count").notNull().default(0),
    storedCount: integer("stored_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    failures: jsonb("failures").$type<RadarFetchRunFailure[]>().notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusStartedIdx: index("radar_fetch_run_status_started_idx").on(t.status, t.startedAt),
    startedIdx: index("radar_fetch_run_started_idx").on(t.startedAt),
    statusCheck: check(
      "radar_fetch_run_status_check",
      sql`${t.status} IN ('running', 'success', 'partial', 'failure')`,
    ),
  }),
);

// Extracted learning objects. Raw events remain evidence; /learn and social
// surfaces read these normalized lessons so builders know what to steal without
// reading logs cold. Visibility is intentionally not denormalized here: all
// public reads join trail_session and re-check visibility/shared/redaction.
export const sessionLesson = pgTable(
  "session_lesson",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    lessonIndex: integer("lesson_index").notNull(),
    title: text("title").notNull(),
    whatToSteal: text("what_to_steal").notNull(),
    useWhen: text("use_when").notNull(),
    promptPattern: text("prompt_pattern"),
    decision: text("decision"),
    failureMode: text("failure_mode"),
    proof: text("proof").notNull(),
    stack: jsonb("stack").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sourceEventIdxs: jsonb("source_event_idxs")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    transferabilityScore: integer("transferability_score").notNull().default(3),
    confidence: text("confidence").notNull().default("medium"),
    model: text("model"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionLessonIdx: uniqueIndex("session_lesson_session_lesson_idx").on(
      t.sessionId,
      t.lessonIndex,
    ),
    sessionIdx: index("session_lesson_session_idx").on(t.sessionId, t.lessonIndex),
    scoreIdx: index("session_lesson_score_idx").on(t.transferabilityScore, t.generatedAt),
    transferabilityCheck: check(
      "session_lesson_transferability_check",
      sql`${t.transferabilityScore} BETWEEN 1 AND 5`,
    ),
    confidenceCheck: check(
      "session_lesson_confidence_check",
      sql`${t.confidence} IN ('high', 'medium', 'low')`,
    ),
    lessonIndexCheck: check("session_lesson_lesson_index_check", sql`${t.lessonIndex} >= 0`),
  }),
);

// Saved lessons are private bookmarks for reusable moves extracted from public
// receipts. `session_id` is denormalized so saved collections can re-check
// receipt visibility without relying only on the lesson row.
export const savedLesson = pgTable(
  "saved_lesson",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => sessionLesson.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("saved_lesson_user_lesson_idx").on(t.userId, t.lessonId),
    userCreatedIdx: index("saved_lesson_user_created_idx").on(t.userId, t.createdAt),
    sessionIdx: index("saved_lesson_session_idx").on(t.sessionId, t.createdAt),
  }),
);

// Lesson reuse is an explicit social signal: a signed-in builder says a public
// lesson made it into their own work. Reads still join trail_session for current
// visibility because public lessons can later be unpublished or redacted.
export const lessonReuse = pgTable(
  "lesson_reuse",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => sessionLesson.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("lesson_reuse_user_lesson_idx").on(t.userId, t.lessonId),
    userCreatedIdx: index("lesson_reuse_user_created_idx").on(t.userId, t.createdAt),
    lessonIdx: index("lesson_reuse_lesson_idx").on(t.lessonId, t.createdAt),
    sessionIdx: index("lesson_reuse_session_idx").on(t.sessionId, t.createdAt),
  }),
);

// Materialized trending feed. Refreshed nightly by /api/cron/discover.
// Score formula lives in the cron route, not here — this table is just the
// rendered output (rank + score + slug). FK cascade handles row deletes.
export const discoverFeed = pgTable(
  "discover_feed",
  {
    slug: text("slug")
      .primaryKey()
      .references(() => trailSession.slug, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    score: numeric("score", { precision: 10, scale: 4 }).notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rankIdx: index("discover_feed_rank_idx").on(t.rank),
  }),
);

// Phase 1 — reactions on sessions ("this worked" / "needed tweak" / "broken").
// Uniqueness on (session, user, kind) means each user gets one reaction per
// kind per session — the UI can let them switch between kinds by deleting
// the previous row first, or accumulate (the data supports either).
export const sessionReaction = pgTable(
  "session_reaction",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'worked' | 'needs-tweak' | 'broken' | 'worked-verified'
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("session_reaction_session_idx").on(t.sessionId, t.kind),
    userKindIdx: uniqueIndex("session_reaction_user_kind_idx").on(t.sessionId, t.userId, t.kind),
  }),
);

// Phase 2 — public receipt conversation. Root comments may have one level of
// replies; deletes are soft so reply context stays readable.
export const sessionComment = pgTable(
  "session_comment",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => sessionComment.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: text("deleted_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => ({
    sessionCreatedIdx: index("session_comment_session_created_idx").on(t.sessionId, t.createdAt),
    parentIdx: index("session_comment_parent_idx").on(t.parentId, t.createdAt),
    userIdx: index("session_comment_user_idx").on(t.userId, t.createdAt),
  }),
);

// Saved receipts are private bookmarks for signed-in builders. They point at
// public receipts, but reads still re-check the receipt's current visibility so
// unpublished/redacted sessions disappear from saved collections immediately.
export const savedReceipt = pgTable(
  "saved_receipt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("saved_receipt_user_session_idx").on(t.userId, t.sessionId),
    userCreatedIdx: index("saved_receipt_user_created_idx").on(t.userId, t.createdAt),
  }),
);

// Phase 2 — notification hooks for social activity. The first producer is
// comments/replies; read surfaces can evolve without rewriting activity rows.
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    sessionId: text("session_id").references(() => trailSession.id, {
      onDelete: "cascade",
    }),
    commentId: text("comment_id").references(() => sessionComment.id, {
      onDelete: "set null",
    }),
    lessonId: text("lesson_id").references(() => sessionLesson.id, {
      onDelete: "cascade",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userReadCreatedIdx: index("notification_user_read_created_idx").on(
      t.userId,
      t.readAt,
      t.createdAt,
    ),
    sessionIdx: index("notification_session_idx").on(t.sessionId, t.createdAt),
    lessonIdx: index("notification_lesson_idx").on(t.lessonId, t.createdAt),
    reactionActivityUniq: uniqueIndex("notification_reaction_activity_uniq")
      .on(t.userId, t.actorId, t.sessionId, t.type)
      .where(sql`${t.type} = 'session_reaction'`),
    followActivityUniq: uniqueIndex("notification_follow_activity_uniq")
      .on(t.userId, t.actorId, t.type)
      .where(sql`${t.type} = 'follow'`),
    lessonReuseActivityUniq: uniqueIndex("notification_lesson_reuse_activity_uniq")
      .on(t.userId, t.actorId, t.lessonId, t.type)
      .where(sql`${t.type} = 'lesson_reuse'`),
  }),
);

// Phase 1.7 — curated playlists ("Best onboarding trails", "GPT-5 deep work", ...).
export const playlist = pgTable("playlist", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  curatorId: text("curator_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  isOfficial: boolean("is_official").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playlistItem = pgTable(
  "playlist_item",
  {
    id: text("id").primaryKey(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlist.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    note: text("note"),
  },
  (t) => ({
    playlistIdx: index("playlist_item_playlist_idx").on(t.playlistId, t.position),
  }),
);

// Phase R1 — Recaps. Polymorphic by `tier`:
//   pulse    → references a single trailSession (sessionId set)
//   project  → references a single trailSession (sessionId set)
//   weekly   → aggregates sessions in [windowStart, windowEnd) (sessionId null)
//   monthly  → same
//   wrapped  → same, annual window
// Payload is the cached aggregate JSON used by the render layer + OG card so
// we don't recompute on every share-load. Regenerated when the underlying
// data changes (cron for windowed tiers, trigger on session edit for pulse/project).
export const recap = pgTable(
  "recap",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tier: text("tier").notNull(), // 'pulse' | 'weekly' | 'monthly' | 'project' | 'wrapped'
    slug: text("slug").notNull(), // public URL token, e.g. /r/<slug>
    // For pulse/project — the source session. Null for windowed tiers.
    sessionId: text("session_id").references(() => trailSession.id, {
      onDelete: "cascade",
    }),
    // For windowed tiers (weekly/monthly/wrapped). Null for pulse/project.
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    // Cached render-ready aggregate. Shape lives in lib/recap/aggregate.ts.
    payload: jsonb("payload").notNull(),
    // LLM-generated one-liner (tone-spec-bound). Diagnostic-validated, never regex-patched.
    oneLiner: text("one_liner"),
    oneLinerValidatorWarnings: jsonb("one_liner_validator_warnings").$type<string[]>(),
    // Visibility mirrors trailSession semantics: public | private | pending.
    visibility: text("visibility").notNull().default("private"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    shareCount: integer("share_count").notNull().default(0),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("recap_slug_idx").on(t.slug),
    userTierIdx: index("recap_user_tier_idx").on(t.userId, t.tier),
    windowIdx: index("recap_window_idx").on(t.userId, t.tier, t.windowStart),
  }),
);

// Short-lived single-use tokens for CLI device-code login. CLI generates id
// (random hex), opens /cli-auth?token=id; the success page fills in
// cookie_value + user_handle; /api/cli-auth/poll hands them to the CLI and
// deletes the row.
export const cliToken = pgTable("cli_token", {
  id: text("id").primaryKey(),
  cookieValue: text("cookie_value"),
  userHandle: text("user_handle"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Task 1.2 — cost-per-PR pivot. Reference table of per-model token prices
// keyed by (vendor, modelId, effectiveFrom). Receipt cost calc looks up the
// row whose effectiveFrom <= session start (and effectiveTo IS NULL OR > start)
// then snapshots the rates into trailSession.modelPriceSnapshot so historical
// receipts stay stable even as vendors change pricing. Numeric columns are
// USD per 1M tokens.
export const modelPrice = pgTable(
  "model_price",
  {
    id: text("id").primaryKey(), // e.g. 'anthropic:claude-sonnet-4-5:2026-05'
    vendor: text("vendor").notNull(), // 'anthropic' | 'openai' | 'cursor' | 'copilot'
    modelId: text("model_id").notNull(), // 'claude-sonnet-4-5', 'gpt-4o-2024-08-06', etc.
    inUsdPerMtok: numeric("in_usd_per_mtok", { precision: 10, scale: 4 }).notNull(),
    outUsdPerMtok: numeric("out_usd_per_mtok", { precision: 10, scale: 4 }).notNull(),
    cachedInUsdPerMtok: numeric("cached_in_usd_per_mtok", { precision: 10, scale: 4 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    source: text("source"), // URL of the pricing page snapshot
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorModelIdx: index("model_price_vendor_model_idx").on(t.vendor, t.modelId),
    effectiveIdx: index("model_price_effective_idx").on(t.vendor, t.modelId, t.effectiveFrom),
    // Enforce "only one active row per (vendor, model_id)" where active means
    // effective_to IS NULL. Without this, lookupModelPrice would pick one of
    // multiple active rows nondeterministically and silently misprice receipts.
    modelPriceActiveUniq: uniqueIndex("model_price_active_uniq")
      .on(t.vendor, t.modelId)
      .where(sql`effective_to IS NULL`),
  }),
);

// Task 1.3 — cost-per-PR pivot. Per-user vendor API key vault. The plaintext
// key never touches the row; api_key_enc holds the libsodium secretbox
// (nonce || ciphertext, URL-safe base64) produced by lib/crypto/vendor-keys.
// One row per (user, vendor) via the unique index; sync_status drives the
// background poller that fetches token usage from each vendor's API.
export const vendorConnection = pgTable(
  "vendor_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vendor: text("vendor").notNull(),
    apiKeyEnc: text("api_key_enc").notNull(),
    workspaceId: text("workspace_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("pending"),
    syncErrorMessage: text("sync_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userVendorIdx: uniqueIndex("vendor_connection_user_vendor_idx").on(t.userId, t.vendor),
  }),
);

// Task 2.4 — cost-per-PR pivot. Raw vendor usage-bucket rows pulled from
// per-vendor org-usage APIs by the hourly sync worker. We DELIBERATELY store
// the API's native granularity (per-bucket × per-model × per-workspace token
// counts) without pre-aggregating to PRs — the PR attribution pass (Week 4)
// joins these rows to trail_session windows. Treat this table as an audit log
// of what each vendor told us; never mutate a row after the bucket closes
// other than via the worker's idempotent upsert.
//
// Idempotency note: the natural unique key (user, vendor, bucketStart, model,
// workspaceId, apiKeyId) includes nullable columns. Under Postgres default
// NULLS DISTINCT semantics, duplicates with NULL values would not conflict on
// the unique index, so the worker instead derives a deterministic PK from a
// canonical-JSON hash of the natural key and uses `ON CONFLICT (id) DO NOTHING`.
// The unique index remains as a query-path accelerator and a secondary guard
// for the all-non-null case.
export const vendorUsageBucket = pgTable(
  "vendor_usage_bucket",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vendor: text("vendor").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    bucketEnd: timestamp("bucket_end", { withTimezone: true }).notNull(),
    bucketWidth: text("bucket_width").notNull(), // '1h' | '1d'
    model: text("model"), // model id; nullable when API didn't group by model
    workspaceId: text("workspace_id"),
    apiKeyId: text("api_key_id"),
    serviceTier: text("service_tier"),
    contextWindow: text("context_window"),
    uncachedInputTokens: integer("uncached_input_tokens").notNull().default(0),
    cacheCreationInputTokens: integer("cache_creation_input_tokens").notNull().default(0),
    cacheReadInputTokens: integer("cache_read_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
    modelPriceSnapshot: jsonb("model_price_snapshot").$type<{
      model: string;
      inUsdPerMtok: number;
      outUsdPerMtok: number;
      cachedReadUsdPerMtok: number | null;
      cachedCreationUsdPerMtok: number | null;
      capturedAt: string;
    }>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    rawPayload: jsonb("raw_payload"), // full API row for debugging — null OK
  },
  (t) => ({
    userVendorBucketIdx: index("vendor_usage_bucket_user_vendor_bucket_idx").on(
      t.userId,
      t.vendor,
      t.bucketStart,
    ),
    userVendorModelIdx: index("vendor_usage_bucket_user_vendor_model_idx").on(
      t.userId,
      t.vendor,
      t.model,
    ),
    uniqueBucket: uniqueIndex("vendor_usage_bucket_unique_idx").on(
      t.userId,
      t.vendor,
      t.bucketStart,
      t.model,
      t.workspaceId,
      t.apiKeyId,
    ),
  }),
);

// Week 4 — cost-per-PR pivot. PR-attributed cost ledger. Two attribution paths
// land rows here:
//   - 'native'           → trail_session.estimatedCostUsd is already populated
//                          from per-event tokens (Claude Code / Cursor sessions
//                          captured by the CLI). attributedCostUsd mirrors that
//                          value 1:1; vendorBucketId is NULL.
//   - 'fanout_anthropic' /
//     'fanout_openai'    → vendor_usage_bucket carries the cost (org-usage API
//                          gives no per-PR linkage). The engine fans it out
//                          across shipped trail_session rows that landed inside
//                          the bucket's window, weighted by session duration
//                          (or evenly when durations are missing).
//
// Idempotency: the engine derives `id` as sha256 of (sessionId + source + bucketId)
// and uses ON CONFLICT (id) DO NOTHING. The unique index is a secondary guard
// against accidental hash collisions / direct INSERTs; it only fires for
// non-null vendorBucketId rows (Postgres default NULLS DISTINCT) but the PK
// covers the native path regardless.
export const sessionCostAttribution = pgTable(
  "session_cost_attribution",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'native' | 'fanout_anthropic' | 'fanout_openai'
    vendorBucketId: text("vendor_bucket_id").references(() => vendorUsageBucket.id, {
      onDelete: "set null",
    }), // null for 'native'
    attributedCostUsd: numeric("attributed_cost_usd", {
      precision: 12,
      scale: 6,
    }).notNull(),
    attributionMethod: text("attribution_method").notNull(), // 'session_native' | 'fanout_by_duration' | 'fanout_evenly'
    attributedAt: timestamp("attributed_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => ({
    sessionIdx: index("session_cost_attribution_session_idx").on(t.sessionId),
    userVendorBucketIdx: index("session_cost_attribution_user_bucket_idx").on(
      t.userId,
      t.vendorBucketId,
    ),
    uniqueBySource: uniqueIndex("session_cost_attribution_unique_idx").on(
      t.sessionId,
      t.source,
      t.vendorBucketId,
    ),
  }),
);

// Layer 2 spend audit. One row per (user, window) AI audit run. Findings
// cache lives here so re-renders of the same window are free; the rate
// limit (1/24h, 10/mo) is enforced by counting rows.
export const spendAudit = pgTable(
  "spend_audit",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    windowDays: integer("window_days").notNull(), // 7 | 30 | 365
    // Bucket key for the rate-limit + cache. ISO date of when this audit
    // was bucketed (UTC day). Two runs on the same calendar day for the
    // same window share a bucket.
    windowBucket: text("window_bucket").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    model: text("model").notNull(),
    // Top-level summary: $-savings the model thinks the user could capture
    // by applying every finding.
    totalPotentialSavingsUsd: numeric("total_potential_savings_usd", { precision: 10, scale: 4 }),
    // Cost of running THIS audit itself, so users can see the ROI.
    auditCostUsd: numeric("audit_cost_usd", { precision: 10, scale: 4 }),
    // [{title, severity:'low'|'medium'|'high', recommendation,
    //   estimated_monthly_savings_usd, evidence_event_ids?:string[]}]
    findings: jsonb("findings").notNull().$type<
      Array<{
        title: string;
        severity: "low" | "medium" | "high";
        recommendation: string;
        estimatedMonthlySavingsUsd: number;
        evidenceEventIds?: string[];
      }>
    >(),
    // Anonymize report kept for transparency / debugging.
    redactionReport: jsonb("redaction_report").$type<{
      total: number;
      byCategory: Record<string, number>;
      suspectCount: number;
    }>(),
  },
  (t) => ({
    userIdx: index("spend_audit_user_idx").on(t.userId, t.generatedAt),
    bucketIdx: uniqueIndex("spend_audit_user_window_bucket_idx").on(
      t.userId,
      t.windowDays,
      t.windowBucket,
    ),
  }),
);

// Phase 2 (30d social primitives) — directed follow graph. A row means
// `followerId` follows `followingId`. Uniqueness on the pair makes follow
// idempotent; the CHECK guards against self-follows at the DB layer (the app
// also guards in `lib/follow.ts`).
export const follow = pgTable(
  "follow",
  {
    id: text("id").primaryKey(),
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("follow_pair_idx").on(t.followerId, t.followingId),
    followingIdx: index("follow_following_idx").on(t.followingId),
    noSelf: check("follow_no_self_check", sql`${t.followerId} <> ${t.followingId}`),
  }),
);

// 30d→60d bridge — normalized projection of each session's LLM-extracted
// `tool`/`toolsUsed`/`frameworks`/`models` into a tag corpus. trail_session
// keeps those jsonb arrays for /learn faceting; this table is the indexed,
// outcome-rankable grain the 60-day entity pages (/tools/[slug],
// /frameworks/[slug]) build on (tag × reaction joins, related-tool
// co-occurrence, per-builder rollups, slug lookups). Kept as a PURE projection:
// visibility/outcome are NOT denormalized here — queries join trail_session and
// filter visibility='public' at read time, so a session going private needs no
// write here. Slug canonicalization lives in lib/tags.ts.
export const sessionTag = pgTable(
  "session_tag",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trailSession.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(), // canonical slug, the stable URL key (e.g. "nextjs")
    label: text("label").notNull(), // display label derived from the slug (e.g. "Next.js")
    kind: text("kind").notNull(), // 'tool' | 'framework' | 'model' | 'community'
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("1.000"),
    source: text("source").notNull().default("llm"), // 'llm' | 'heuristic'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One row per (session, slug, kind). The same slug may appear under two
    // kinds (e.g. tool:react + framework:react) — that's intentional, so kind
    // is part of the unique grain.
    pairIdx: uniqueIndex("session_tag_session_tag_kind_idx").on(t.sessionId, t.tag, t.kind),
    // Covering order for the hot entity-page path: look up by kind+tag, then
    // join out to trail_session by sessionId.
    lookupIdx: index("session_tag_kind_tag_idx").on(t.kind, t.tag, t.sessionId),
  }),
);

// Postgres-backed fixed-window rate limiter for social mutations (reactions,
// comments, follows, posts). One row per "<action>:<userId>" bucket key; the
// limiter upserts atomically so concurrent requests serialize on the row.
// Rows are bounded by (actions x users); prune old buckets periodically.
export const rateLimitBucket = pgTable("rate_limit_bucket", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});
