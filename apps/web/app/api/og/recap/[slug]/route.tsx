/**
 * GET /api/og/recap/[slug] — 1200x675 share card for a recap.
 *
 * Uses next/og (edge runtime). Renders a tier-agnostic card that surfaces
 * the recap's headline number + top model + tool, plus the one-liner if set.
 */
export const runtime = "edge";

import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { RecapPayload } from "@/lib/recap/aggregate";

const BG = "var(--page-base-2)";
const FG = "#fafafa";
const ACCENT = "#a7f300";
const MUTED = "#71717a";
const BORDER = "#27272a";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const recap = await db.query.recap.findFirst({
    where: eq(schema.recap.slug, slug),
  });
  if (!recap || recap.visibility !== "public") {
    return new Response("Not found", { status: 404 });
  }
  // Cost-tier recaps use a different payload shape — the classic OG card
  // would render NaN counts. Return 404 until a cost-specific card lands.
  if (recap.tier.startsWith("cost-")) {
    return new Response("Not found", { status: 404 });
  }

  const owner = await db.query.user.findFirst({
    where: eq(schema.user.id, recap.userId),
    columns: { handle: true },
  });

  const session = recap.sessionId
    ? await db.query.trailSession.findFirst({
        where: eq(schema.trailSession.id, recap.sessionId),
        columns: { title: true, linkedCommitSha: true, linkedRepo: true },
      })
    : null;

  const payload = recap.payload as RecapPayload;
  const tierLabel = recap.tier.toUpperCase();
  const headline =
    session?.title ??
    recap.oneLiner ??
    `${payload.shippedCount} shipped of ${payload.sessionCount}`;
  const topModel = payload.topModels[0]?.name;
  const topTool = payload.topTools[0]?.name;

  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "675px",
        background: BG,
        color: FG,
        display: "flex",
        flexDirection: "column",
        padding: "64px 72px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          fontSize: "16px",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: MUTED,
          fontFamily: "monospace",
        }}
      >
        <span style={{ color: ACCENT }}>TRAIL RECAP</span>
        <span style={{ color: BORDER }}>·</span>
        <span>{tierLabel}</span>
        {owner?.handle && (
          <>
            <span style={{ color: BORDER }}>·</span>
            <span>@{owner.handle}</span>
          </>
        )}
      </div>

      {/* Headline */}
      <div
        style={{
          display: "flex",
          fontSize: headline.length > 60 ? "52px" : "68px",
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          color: FG,
          marginTop: "48px",
          maxWidth: "1000px",
        }}
      >
        {headline.length > 110 ? headline.slice(0, 107) + "…" : headline}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, display: "flex" }} />

      {/* Stat row */}
      <div
        style={{
          display: "flex",
          gap: "56px",
          paddingTop: "32px",
          borderTop: `1px solid ${BORDER}`,
          fontFamily: "monospace",
        }}
      >
        <Stat label="SHIPPED" value={String(payload.shippedCount)} accent />
        <Stat label="SESSIONS" value={String(payload.sessionCount)} />
        {topModel && <Stat label="MODEL" value={topModel} />}
        {topTool && <Stat label="TOOL" value={topTool} />}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "28px",
          fontSize: "16px",
          color: MUTED,
          fontFamily: "monospace",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        <span>
          <span style={{ color: ACCENT }}>/</span> trail
        </span>
        {session?.linkedCommitSha && (
          <span>
            {session.linkedRepo ?? "commit"} · {session.linkedCommitSha.slice(0, 7)}
          </span>
        )}
      </div>
    </div>,
    { width: 1200, height: 675 },
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span
        style={{
          fontSize: "14px",
          letterSpacing: "0.22em",
          color: MUTED,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "36px",
          color: accent ? ACCENT : FG,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        {value.length > 24 ? value.slice(0, 22) + "…" : value}
      </span>
    </div>
  );
}
