// Local-only dev seed: creates a demo builder with public sessions so the
// follow/feed flow can be exercised with a second account. Idempotent.
// Run: pnpm --filter @trail/web exec tsx scripts/seed-demo-follow.ts
import { randomUUID } from "node:crypto";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";

const DEMO_HANDLE = "demo.builder";
const DEMO_EMAIL = "demo.builder@trail.local";

async function main() {
  // Upsert the demo user by stable id so reseeding is a no-op.
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, DEMO_HANDLE))
    .limit(1);

  let demoId = existing[0]?.id;
  if (!demoId) {
    demoId = `demo_${randomUUID()}`;
    await db.insert(schema.user).values({
      id: demoId,
      name: "Demo Builder",
      email: DEMO_EMAIL,
      emailVerified: true,
      image: "https://avatars.githubusercontent.com/u/9919?s=200&v=4",
      handle: DEMO_HANDLE,
      githubHandle: DEMO_HANDLE,
      bio: "Seed account for local follow/feed testing.",
    });
    console.log(`created demo user ${demoId} (@${DEMO_HANDLE})`);
  } else {
    console.log(`demo user already exists ${demoId} (@${DEMO_HANDLE})`);
  }

  const now = Date.now();
  const sessions = [
    {
      slug: "nextjs-rsc-streaming",
      tool: "claude-code",
      title: "Streaming RSC payloads in Next.js 16",
      summary: "Refactored the dashboard to stream server components and cut TTFB in half.",
      tool_used: ["claude-code"],
      frameworks: ["nextjs", "react"],
      ageHours: 3,
      eventCount: 142,
    },
    {
      slug: "drizzle-neon-hnsw",
      tool: "cursor",
      title: "Adding pgvector HNSW search with Drizzle + Neon",
      summary: "Wired up text-embedding-3-small and an HNSW index for semantic session search.",
      tool_used: ["cursor"],
      frameworks: ["drizzle", "postgres"],
      ageHours: 27,
      eventCount: 89,
    },
    {
      slug: "biome-monorepo-lint",
      tool: "codex",
      title: "Taming Biome across a Turbo monorepo",
      summary: "Set up incremental Biome checks so CI only lints changed packages.",
      tool_used: ["codex"],
      frameworks: ["turborepo", "biome"],
      ageHours: 50,
      eventCount: 56,
    },
  ];

  for (const s of sessions) {
    const startedAt = new Date(now - s.ageHours * 3600_000);
    await db
      .insert(schema.trailSession)
      .values({
        id: `demo_sess_${s.slug}`,
        userId: demoId,
        slug: s.slug,
        tool: s.tool,
        title: s.title,
        summary: s.summary,
        eventCount: s.eventCount,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 1800_000),
        sharedAt: startedAt,
        visibility: "public",
        toolsUsed: s.tool_used,
        frameworks: s.frameworks,
        taskType: "shipped",
        outcome: "shipped",
      })
      .onConflictDoNothing({ target: schema.trailSession.id });
  }
  console.log(`seeded ${sessions.length} public sessions for @${DEMO_HANDLE}`);
  console.log(`\nVisit:  http://localhost:3000/u/${DEMO_HANDLE}`);
  console.log("Click Follow there, then open http://localhost:3000/feed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
