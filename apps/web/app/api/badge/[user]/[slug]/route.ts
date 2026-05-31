export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

// /api/badge/[user]/[slug].svg → shields.io-style flat SVG badge.
// Embed in a README:
//   [![Born on Trail](https://gettrail.vercel.app/api/badge/jan/abc.svg)](https://gettrail.vercel.app/u/jan/abc)
// Variants via ?style=:
//   default  → "Born on Trail" · tool name
//   shipped  → forces green "shipped" right column
//   tool     → "<tool>" · session title (truncated)

interface Params {
  params: Promise<{ user: string; slug: string }>;
}

// Approximate text width for shields-style sizing. Each char ~6.7px in 11px
// Verdana, plus 10px padding each side. Good enough for SVG layout — we
// don't need pixel perfection because every consumer scales it anyway.
function textWidth(s: string): number {
  return Math.ceil(s.length * 6.7) + 10;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeBadge(leftLabel: string, rightLabel: string, rightColor: string): string {
  const leftW = textWidth(leftLabel);
  const rightW = textWidth(rightLabel);
  const totalW = leftW + rightW;
  const leftX = leftW / 2;
  const rightX = leftW + rightW / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${esc(leftLabel)}: ${esc(rightLabel)}">
  <linearGradient id="g" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="20" fill="#08090a"/>
    <rect x="${leftW}" width="${rightW}" height="20" fill="${rightColor}"/>
    <rect width="${totalW}" height="20" fill="url(#g)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">
    <text x="${leftX}" y="15" fill="#010101" fill-opacity=".3">${esc(leftLabel)}</text>
    <text x="${leftX}" y="14" fill="#a7f300">${esc(leftLabel)}</text>
    <text x="${rightX}" y="15" fill="#010101" fill-opacity=".3">${esc(rightLabel)}</text>
    <text x="${rightX}" y="14">${esc(rightLabel)}</text>
  </g>
</svg>`;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { user, slug } = await params;
  // Slug arrives with `.svg` extension stripped if route file is `[slug.svg]`,
  // but we used the simpler `[slug]/route.ts` under a `.../[slug].svg/`
  // segment, so cope with both.
  const cleanSlug = slug.replace(/\.svg$/i, "");
  const style = req.nextUrl.searchParams.get("style") ?? "default";

  const headers = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
  };

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
  });
  if (!userRow) {
    return new Response(makeBadge("Trail", "unknown user", "#71717a"), { headers, status: 200 });
  }
  const sessionRow = await db.query.trailSession.findFirst({
    where: and(eq(schema.trailSession.userId, userRow.id), eq(schema.trailSession.slug, cleanSlug)),
  });
  if (!sessionRow || sessionRow.visibility !== "public" || !sessionRow.sharedAt) {
    return new Response(makeBadge("Trail", "not found", "#71717a"), { headers, status: 200 });
  }

  let left = "Born on Trail";
  let right = sessionRow.tool;
  let color = "#5e6ad2"; // Trail brand indigo for default

  if (style === "shipped" || sessionRow.outcome === "shipped") {
    left = "Born on Trail";
    right = "shipped";
    color = "#1aa75a"; // shields green for "shipped"
  }
  if (style === "tool") {
    left = sessionRow.tool;
    right = (sessionRow.title ?? cleanSlug).slice(0, 40);
    color = "#5e6ad2";
  }

  return new Response(makeBadge(left, right, color), { headers, status: 200 });
}
