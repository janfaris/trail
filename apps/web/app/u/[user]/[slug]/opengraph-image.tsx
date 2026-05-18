import { ImageResponse } from "next/og";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  COLORS,
  Footer,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ToolSvg,
  Wordmark,
  formatDate,
  loadOgFonts,
  truncate,
} from "@/lib/og";
import { deriveTitle } from "@/lib/derive-title";
import type { EventData } from "@/components/timeline-event";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail session";

export default async function Image({ params }: { params: { user: string; slug: string } }) {
  const fonts = await loadOgFonts();

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, params.user),
  });

  let title = params.slug;
  let tool = "claude-code";
  let eventCount = 0;
  let dateLabel = "";
  let firstPromptText: string | undefined;

  if (userRow) {
    const sessionRow = await db.query.trailSession.findFirst({
      where: and(
        eq(schema.trailSession.userId, userRow.id),
        eq(schema.trailSession.slug, params.slug),
      ),
    });
    if (sessionRow) {
      const events = await db
        .select()
        .from(schema.event)
        .where(eq(schema.event.sessionId, sessionRow.id))
        .orderBy(asc(schema.event.idx))
        .limit(20);
      const fp = events.find((e) => (e.data as EventData).kind === "prompt");
      firstPromptText =
        fp && (fp.data as EventData).kind === "prompt"
          ? (fp.data as { kind: "prompt"; text: string }).text
          : undefined;
      title = sessionRow.title || deriveTitle(firstPromptText, sessionRow.slug);
      tool = sessionRow.tool;
      eventCount = sessionRow.eventCount;
      dateLabel = formatDate(sessionRow.startedAt);
    }
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
            paddingTop: 24,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1.08,
              color: COLORS.text,
              maxWidth: 1060,
              display: "-webkit-box",
              
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {truncate(title, 140)}
          </div>

          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontFamily: "GeistMono",
              fontSize: 22,
              color: COLORS.textDim,
            }}
          >
            <ToolSvg name={tool} size={26} color="#d4d4d8" />
            <span style={{ color: COLORS.text }}>{tool}</span>
            <span style={{ color: COLORS.textFaint }}>·</span>
            <span>@{params.user}</span>
            <span style={{ color: COLORS.textFaint }}>·</span>
            <span>
              <span style={{ color: COLORS.text }}>{eventCount}</span>{" "}
              event{eventCount === 1 ? "" : "s"}
            </span>
            {dateLabel ? (
              <>
                <span style={{ color: COLORS.textFaint }}>·</span>
                <span>{dateLabel}</span>
              </>
            ) : null}
          </div>

          {firstPromptText ? (
            <div
              style={{
                marginTop: 36,
                fontFamily: "GeistMono",
                fontSize: 20,
                color: COLORS.textMute,
                lineHeight: 1.4,
                maxWidth: 1060,
                display: "-webkit-box",
                
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {truncate(firstPromptText.replace(/\s+/g, " ").trim(), 140)}
            </div>
          ) : null}
        </div>

        <Footer />
      </div>
    ),
    { ...size, fonts },
  );
}
