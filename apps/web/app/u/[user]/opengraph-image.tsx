import { COLORS, Footer, OG_CONTENT_TYPE, OG_SIZE, ToolSvg, Wordmark, loadOgFonts } from "@/lib/og";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { ImageResponse } from "next/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail profile";
export const dynamic = "force-dynamic";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export default async function Image({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const fonts = await loadOgFonts();
  const { db, schema } = await import("@/db/client");
  const userRows = await db.select().from(schema.user).where(eq(schema.user.handle, user)).limit(1);
  const userRow = userRows[0];

  const handle = userRow?.handle ?? user;
  const name = userRow?.name && userRow.name !== handle ? userRow.name : undefined;

  let sessionCount = 0;
  let shippedCount = 0;
  let eventCount = 0;
  let followerCount = 0;
  let tools: string[] = [];
  let latestTitle = "Public AI coding receipts";
  if (userRow) {
    const publicReceiptFilter = and(
      eq(schema.trailSession.userId, userRow.id),
      eq(schema.trailSession.visibility, "public"),
      isNotNull(schema.trailSession.sharedAt),
    );

    const [[stats], [followers], latestRows, toolRows] = await Promise.all([
      db
        .select({
          sessionCount: sql<number>`count(*)::int`,
          shippedCount: sql<number>`count(*) filter (where ${schema.trailSession.receiptStatus} = 'shipped' or ${schema.trailSession.outcome} = 'shipped')::int`,
          eventCount: sql<number>`coalesce(sum(${schema.trailSession.eventCount}), 0)::int`,
        })
        .from(schema.trailSession)
        .where(publicReceiptFilter),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.follow)
        .where(eq(schema.follow.followingId, userRow.id)),
      db
        .select({
          title: schema.trailSession.title,
          receiptTldr: schema.trailSession.receiptTldr,
          summary: schema.trailSession.summary,
        })
        .from(schema.trailSession)
        .where(publicReceiptFilter)
        .orderBy(desc(schema.trailSession.sharedAt))
        .limit(1),
      db
        .select({
          tool: schema.trailSession.tool,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.trailSession)
        .where(publicReceiptFilter)
        .groupBy(schema.trailSession.tool)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
    ]);

    sessionCount = Number(stats?.sessionCount ?? 0);
    shippedCount = Number(stats?.shippedCount ?? 0);
    eventCount = Number(stats?.eventCount ?? 0);
    followerCount = Number(followers?.count ?? 0);
    latestTitle =
      latestRows[0]?.title || latestRows[0]?.receiptTldr || latestRows[0]?.summary || latestTitle;
    tools = toolRows.map((row) => row.tool).filter((tool): tool is string => Boolean(tool));
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
        padding: 64,
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -160,
          top: -220,
          width: 620,
          height: 620,
          borderRadius: 999,
          background: "rgba(167,243,0,0.16)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -140,
          bottom: -180,
          width: 560,
          height: 560,
          borderRadius: 999,
          background: "rgba(255,255,255,0.07)",
        }}
      />
      <Wordmark />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 26,
            fontFamily: "GeistMono",
            fontSize: 22,
            color: "#a7f300",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Builder proof card
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 78,
            fontWeight: 600,
            letterSpacing: "-0.035em",
            color: COLORS.text,
            lineHeight: 1,
          }}
        >
          @{handle}
        </div>
        {name ? (
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 28,
              color: COLORS.textDim,
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            marginTop: 28,
            maxWidth: 860,
            fontSize: 34,
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            color: COLORS.textDim,
          }}
        >
          {latestTitle}
        </div>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontFamily: "GeistMono",
            fontSize: 22,
            color: COLORS.textMute,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: COLORS.text }}>{formatCount(sessionCount)}</span>
            <span>public receipts</span>
          </div>
          <span style={{ color: COLORS.textFaint }}>·</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: COLORS.text }}>{formatCount(shippedCount)}</span>
            <span>shipped</span>
          </div>
          <span style={{ color: COLORS.textFaint }}>·</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: COLORS.text }}>{formatCount(eventCount)}</span>
            <span>events</span>
          </div>
          <span style={{ color: COLORS.textFaint }}>·</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: COLORS.text }}>{formatCount(followerCount)}</span>
            <span>followers</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 34,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: "GeistMono",
            fontSize: 18,
            color: COLORS.textMute,
          }}
        >
          {tools.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {tools.slice(0, 6).map((t) => (
                  <ToolSvg key={t} name={t} size={26} color="#d4d4d8" />
                ))}
              </div>
              <span>Top stack from public receipts</span>
            </div>
          ) : null}
        </div>
      </div>

      <Footer />
    </div>,
    { ...size, fonts },
  );
}
