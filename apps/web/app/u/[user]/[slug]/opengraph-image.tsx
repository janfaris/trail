import { COLORS, Footer, OG_CONTENT_TYPE, OG_SIZE, ToolSvg, Wordmark, loadOgFonts } from "@/lib/og";
import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail session";
export const dynamic = "force-dynamic";

export default async function Image({
  params,
}: {
  params: Promise<{ user: string; slug: string }>;
}) {
  const { user, slug } = await params;
  const fonts = await loadOgFonts();
  const { db, schema } = await import("@/db/client");

  const rows = await db
    .select({
      session: schema.trailSession,
      user: schema.user,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.trailSession.slug, slug),
        eq(schema.user.handle, user),
        eq(schema.trailSession.visibility, "public"),
      ),
    )
    .limit(1);

  const row = rows[0];

  if (!row) {
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
        <Wordmark />
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
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              color: COLORS.text,
              lineHeight: 1,
            }}
          >
            @{user}/{slug}
          </div>
        </div>
        <Footer />
      </div>,
      { ...size, fonts },
    );
  }

  const { session, user: userRow } = row;
  const handle = userRow.handle;
  const title = session.title ?? slug;
  const summary = session.summary ?? "";
  const eventCount = session.eventCount ?? 0;

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
      <Wordmark />

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
            fontSize: 68,
            fontWeight: 600,
            letterSpacing: "-0.035em",
            color: COLORS.text,
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>

        {summary ? (
          <div
            style={{
              display: "-webkit-box",
              marginTop: 24,
              fontSize: 28,
              color: COLORS.textDim,
              letterSpacing: "-0.01em",
              lineHeight: 1.35,
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {summary}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontFamily: "GeistMono",
            fontSize: 22,
            color: COLORS.textMute,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <ToolSvg name={session.tool} size={28} color="#d4d4d8" />
          </div>
          <span style={{ color: COLORS.text }}>@{handle}</span>
          <span style={{ color: COLORS.textFaint }}>·</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: COLORS.text }}>{eventCount}</span>
            <span>event{eventCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <Footer />
    </div>,
    { ...size, fonts },
  );
}
