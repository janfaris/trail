export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

// oEmbed provider (https://oembed.com/).
// Discovery: session pages emit
//   <link rel="alternate" type="application/json+oembed" href="https://gettrail.vercel.app/api/oembed?url=...">
// Consumers (X, Slack, Discord, blog editors) fetch this endpoint and get
// back a rich embed object with an iframe URL pointing at /embed/[user]/[slug].
//
// We support the "rich" type. Width/height default to the standard X embed
// rect; consumers may override via maxwidth/maxheight params.

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app";

// Match either https://gettrail.../u/<handle>/<slug> (with optional trailing /).
const URL_RE = /\/u\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/;

function clampDim(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const url = params.get("url");
  const format = params.get("format") ?? "json";

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  if (format !== "json") {
    // oEmbed spec also defines xml; we don't bother since every modern consumer asks for json.
    return NextResponse.json({ error: "only json supported" }, { status: 501 });
  }

  const match = URL_RE.exec(url);
  if (!match) {
    return NextResponse.json({ error: "url does not match a trail session" }, { status: 404 });
  }
  const handle = match[1];
  const slug = match[2];
  if (!handle || !slug) {
    return NextResponse.json({ error: "url does not match a trail session" }, { status: 404 });
  }

  // Resolve user + session and confirm visibility.
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, handle),
  });
  if (!userRow) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const sessionRow = await db.query.trailSession.findFirst({
    where: and(eq(schema.trailSession.userId, userRow.id), eq(schema.trailSession.slug, slug)),
  });
  if (!sessionRow || sessionRow.visibility !== "public" || !sessionRow.sharedAt) {
    return NextResponse.json({ error: "session not found or not public" }, { status: 404 });
  }

  const width = clampDim(params.get("maxwidth"), 560, 240, 800);
  const height = clampDim(params.get("maxheight"), 280, 200, 600);

  const embedUrl = `${BASE}/embed/${handle}/${slug}`;
  const title = sessionRow.title || `${handle}'s trail`;
  const html = `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" scrolling="no" style="border:0;background:transparent;color-scheme:dark;" allow="clipboard-write" referrerpolicy="no-referrer" title=${JSON.stringify(title)}></iframe>`;

  return NextResponse.json(
    {
      version: "1.0",
      type: "rich",
      provider_name: "Trail",
      provider_url: BASE,
      title,
      author_name: handle,
      author_url: `${BASE}/u/${handle}`,
      width,
      height,
      html,
      // Soft cache hint — consumers re-fetch eventually if the page changes.
      cache_age: 600,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
        // CORS so Twitter/Slack/Discord can fetch from any origin.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
