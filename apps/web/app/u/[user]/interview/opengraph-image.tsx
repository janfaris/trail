import { COLORS, Footer, OG_CONTENT_TYPE, OG_SIZE, Wordmark, loadOgFonts } from "@/lib/og";
import { and, desc, eq, sql } from "drizzle-orm";
import { ImageResponse } from "next/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail recruiter view";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const fonts = await loadOgFonts();
  const { db, schema } = await import("@/db/client");
  const userRows = await db.select().from(schema.user).where(eq(schema.user.handle, user)).limit(1);
  const userRow = userRows[0];

  const handle = userRow?.handle ?? user;
  const name = userRow?.name && userRow.name !== handle ? userRow.name : undefined;

  let totalShipped = 0;
  let withGh = 0;
  const skillCounts = new Map<string, number>();
  if (userRow) {
    // Mirror /u/[user]/interview exactly: public + provably shipped only.
    const shipped = await db
      .select({
        toolsUsed: schema.trailSession.toolsUsed,
        frameworks: schema.trailSession.frameworks,
        linkedCommitSha: schema.trailSession.linkedCommitSha,
      })
      .from(schema.trailSession)
      .where(
        and(
          eq(schema.trailSession.userId, userRow.id),
          eq(schema.trailSession.visibility, "public"),
          sql`(${schema.trailSession.outcome} = 'shipped' OR ${schema.trailSession.linkedCommitSha} IS NOT NULL OR ${schema.trailSession.eventCount} >= 20)`,
        ),
      )
      .orderBy(desc(schema.trailSession.startedAt))
      .limit(30);
    totalShipped = shipped.length;
    withGh = shipped.filter((s) => s.linkedCommitSha).length;
    for (const s of shipped) {
      for (const t of [...(s.toolsUsed ?? []), ...(s.frameworks ?? [])]) {
        skillCounts.set(t, (skillCounts.get(t) ?? 0) + 1);
      }
    }
  }
  const topSkills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark />
        <div
          style={{
            display: "flex",
            fontFamily: "GeistMono",
            fontSize: 16,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORS.textMute,
          }}
        >
          Recruiter view
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
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
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 28,
            color: COLORS.textDim,
            letterSpacing: "-0.01em",
          }}
        >
          {name ? `${name} — verified AI-coding work` : "Verified AI-coding work"}
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
            <span style={{ color: COLORS.text }}>{totalShipped}</span>
            <span>shipped</span>
          </div>
          <span style={{ color: COLORS.textFaint }}>·</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: COLORS.accent }}>{withGh}</span>
            <span>GitHub-verified</span>
          </div>
        </div>

        {topSkills.length > 0 ? (
          <div style={{ marginTop: 36, display: "flex", flexWrap: "wrap", gap: 12 }}>
            {topSkills.map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface,
                  fontFamily: "GeistMono",
                  fontSize: 20,
                  color: COLORS.textDim,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Footer />
    </div>,
    { ...size, fonts },
  );
}
