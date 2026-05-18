import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
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
