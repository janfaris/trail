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
