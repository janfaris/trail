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
            alignItems: "center",
            justifyContent: "space-between",
            gap: 64,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div
              style={{
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
              <span style={{ display: "flex", gap: 8 }}>
                <span style={{ color: COLORS.text }}>{sessionCount}</span>
                <span>session{sessionCount === 1 ? "" : "s"}</span>
              </span>
              <span style={{ color: COLORS.textFaint }}>·</span>
              <span style={{ display: "flex", gap: 8 }}>
                <span style={{ color: COLORS.text }}>{eventCount}</span>
                <span>events</span>
              </span>
              {tools.length > 0 ? (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ color: COLORS.textFaint }}>·</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {tools.slice(0, 6).map((t) => (
                      <ToolSvg key={t} name={t} size={26} color="#d4d4d8" />
                    ))}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: 256,
              height: 256,
              borderRadius: 128,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
            }}
          />
        </div>

        <Footer />
      </div>
    ),
    { ...size, fonts },
  );
}
