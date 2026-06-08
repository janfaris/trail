import { COLORS, Footer, OG_CONTENT_TYPE, OG_SIZE, Wordmark, loadOgFonts } from "@/lib/og";
import { ImageResponse } from "next/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail Build Kit";
export const dynamic = "force-dynamic";

type KitOg = {
  title: string;
  summary: string | null;
  sourceRepo: string;
  reproducibility: string;
  reuseCount: number;
  frameworks: string[];
  authorHandle: string | null;
};

async function loadKitOg(id: string): Promise<KitOg | null> {
  try {
    const { db, schema } = await import("@/db/client");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await db
      .select({
        title: schema.buildKit.title,
        summary: schema.buildKit.summary,
        sourceRepo: schema.buildKit.sourceRepo,
        reproducibility: schema.buildKit.reproducibility,
        reuseCount: schema.buildKit.reuseCount,
        stackManifest: schema.buildKit.stackManifest,
        authorHandle: schema.user.handle,
      })
      .from(schema.buildKit)
      .innerJoin(schema.user, eq(schema.buildKit.userId, schema.user.id))
      .where(and(eq(schema.buildKit.id, id), eq(schema.buildKit.visibility, "public")))
      .limit(1);
    if (!row) return null;
    return {
      title: row.title,
      summary: row.summary,
      sourceRepo: row.sourceRepo,
      reproducibility: row.reproducibility,
      reuseCount: row.reuseCount,
      frameworks: row.stackManifest?.frameworks ?? [],
      authorHandle: row.authorHandle,
    };
  } catch {
    return null;
  }
}

function reproWord(value: string): string {
  if (value === "verified") return "verified setup";
  if (value === "partial") return "repo-derived setup";
  return "prompts only";
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();
  const kit = await loadKitOg(id);

  const title = kit?.title ?? "Build Kit";
  const eyebrow = "BUILD KIT — STEAL THIS SETUP";

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

      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            fontFamily: "GeistMono",
            fontSize: 22,
            letterSpacing: "0.18em",
            color: COLORS.accent,
          }}
        >
          {eyebrow}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 68,
            fontWeight: 600,
            letterSpacing: "-0.035em",
            color: COLORS.text,
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>

        {kit?.summary ? (
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
            {kit.summary}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: "GeistMono",
            fontSize: 22,
            color: COLORS.textMute,
          }}
        >
          {kit?.authorHandle ? (
            <span style={{ color: COLORS.text }}>@{kit.authorHandle}</span>
          ) : null}
          {kit?.sourceRepo ? (
            <>
              <span style={{ color: COLORS.textFaint }}>·</span>
              <span>{kit.sourceRepo}</span>
            </>
          ) : null}
          <span style={{ color: COLORS.textFaint }}>·</span>
          <span
            style={{ color: kit?.reproducibility === "verified" ? COLORS.accent : COLORS.textMute }}
          >
            {reproWord(kit?.reproducibility ?? "prompts-only")}
          </span>
          {kit && kit.reuseCount > 0 ? (
            <>
              <span style={{ color: COLORS.textFaint }}>·</span>
              <span style={{ color: COLORS.text }}>
                {kit.reuseCount} fork{kit.reuseCount === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
        </div>

        {kit && kit.frameworks.length > 0 ? (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 12,
              fontFamily: "GeistMono",
              fontSize: 20,
              color: COLORS.textFaint,
            }}
          >
            {kit.frameworks.slice(0, 5).map((f) => (
              <span key={f}>#{f}</span>
            ))}
          </div>
        ) : null}
      </div>

      <Footer />
    </div>,
    { ...size, fonts },
  );
}
