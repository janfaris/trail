import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  vector,
} from "drizzle-orm/pg-core";

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
    taskType: text("task_type"),       // "onboarding"|"debugging"|"migration"|"spike"|"shipped"|"refactor"|"research"|"other"
    models: jsonb("models").$type<string[]>(),
    outcome: text("outcome"),          // "shipped"|"abandoned"|"rabbithole"|"unknown"
    // Phase 2 — GitHub linkage (autodetected at record-time from git remote).
    linkedPrUrl: text("linked_pr_url"),       // https://github.com/<owner>/<repo>/pull/<n>
    linkedCommitSha: text("linked_commit_sha"),
    linkedRepo: text("linked_repo"),          // <owner>/<repo>
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
    }>(),
    receiptValidatorWarnings: jsonb("receipt_validator_warnings").$type<string[]>(),
    receiptGeneratedAt: timestamp("receipt_generated_at"),
    // 'shipped' | 'draft' | 'unverified'. Mirrors verifyShipped() output.
    receiptStatus: text("receipt_status"),
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
    refreshedAt: timestamp("refreshed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionIdx: index("session_reaction_session_idx").on(t.sessionId, t.kind),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    effectiveIdx: index("model_price_effective_idx").on(
      t.vendor,
      t.modelId,
      t.effectiveFrom,
    ),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userVendorIdx: uniqueIndex("vendor_connection_user_vendor_idx").on(
      t.userId,
      t.vendor,
    ),
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
    cacheCreationInputTokens: integer("cache_creation_input_tokens")
      .notNull()
      .default(0),
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
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
