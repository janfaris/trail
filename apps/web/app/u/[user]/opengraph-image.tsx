import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  COLORS,
  Footer,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ToolSvg,
  Wordmark,
  loadOgFonts,
} from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail profile";

export default async function Image({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const fonts = await loadOgFonts();
  const userRows = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.handle, user))
    .limit(1);
  const userRow = userRows[0];

  const handle = userRow?.handle ?? user;
  const name = userRow?.name && userRow.name !== handle ? userRow.name : undefined;

  let sessionCount = 0;
  let eventCount = 0;
  let tools: string[] = [];
  if (userRow) {
    const sessions = await db
      .select()
      .from(schema.trailSession)
      .where(eq(schema.trailSession.userId, userRow.id));
    sessionCount = sessions.length;
    eventCount = sessions.reduce((n, s) => n + (s.eventCount ?? 0), 0);
    tools = Array.from(new Set(sessions.map((s) => s.tool))).filter(Boolean);
  }

  return new ImageResponse(
    (
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
              <span style={{ color: COLORS.text }}>{sessionCount}</span>
              <span>session{sessionCount === 1 ? "" : "s"}</span>
            </div>
            <span style={{ color: COLORS.textFaint }}>·</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: COLORS.text }}>{eventCount}</span>
              <span>events</span>
            </div>
            {tools.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: COLORS.textFaint }}>·</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {tools.slice(0, 6).map((t) => (
                    <ToolSvg key={t} name={t} size={26} color="#d4d4d8" />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <Footer />
      </div>
    ),
    { ...size, fonts },
  );
}
