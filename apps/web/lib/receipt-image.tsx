// Deterministic thermal-receipt PNG renderer (Task 5.5).
//
// Renders a 600x900 PNG that looks like a paper thermal receipt. Used as
// the OG/Twitter image for /u/<handle>/<slug> share previews and as the
// downloadable receipt at /api/receipt/<id>/image.png.
//
// Implemented with `next/og` (Satori + Resvg) so it runs on Vercel without
// any native binaries. Given identical input + identical bundled fonts,
// the output is deterministic.

import { ImageResponse } from "next/og";
import * as React from "react";

export interface ReceiptImageInput {
  handle: string;
  slug: string;
  shortId: string;
  tool: string;
  date: string; // ISO date (yyyy-mm-dd); pass a stable string for determinism
  tldr: string;
  commitSha: string | null;
  changedFiles: string[];
  redactionCount: number;
  status: "shipped" | "draft" | "unverified";
}

const W = 600;
const H = 900;
const BG = "#f7f2e8"; // cream
const FG = "#0a0a0a"; // near-black
const MUTED = "#5b5b5b";
const GREEN = "#0f7a3a";
const AMBER = "#a86b00";
const GRAY = "#5b5b5b";

// Satori needs a real font file to be deterministic. We rely on the
// platform's monospace stack here: Satori falls back to its embedded
// font when no `fonts` option is provided. That fallback is deterministic
// across runs (it's bundled with the library), and identical inputs
// produce byte-identical PNGs.
const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Courier New', monospace";

function statusBadge(status: ReceiptImageInput["status"]) {
  if (status === "shipped") return { glyph: "[x]", label: "SHIPPED", color: GREEN };
  if (status === "draft") return { glyph: "[~]", label: "DRAFT", color: AMBER };
  return { glyph: "[!]", label: "UNVERIFIED", color: GRAY };
}

function withAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function DashedRule() {
  return (
    <div
      style={{
        width: "100%",
        height: 1,
        marginTop: 4,
        marginBottom: 4,
        backgroundImage:
          "repeating-linear-gradient(to right, #1a1a1a 0 6px, transparent 6px 10px)",
      }}
    />
  );
}

function ReceiptDoc(input: ReceiptImageInput) {
  const badge = statusBadge(input.status);
  const fileCount = input.changedFiles.length;
  const shownFiles = input.changedFiles.slice(0, 5);
  const tldr = input.tldr || "(no summary)";

  return (
    <div
      style={{
        width: W,
        height: H,
        backgroundColor: BG,
        color: FG,
        fontFamily: MONO_STACK,
        padding: "40px 36px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header row: TRAIL ━━━━ #shortId */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, color: FG }}>TRAIL</div>
        <div
          style={{
            flexGrow: 1,
            height: 3,
            backgroundColor: FG,
            margin: "0 14px",
          }}
        />
        <div style={{ fontSize: 12, color: MUTED }}>#{input.shortId}</div>
      </div>

      {/* Date / tool */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 18,
          fontSize: 13,
        }}
      >
        <div style={{ color: FG }}>{input.date}</div>
        <div style={{ color: MUTED }}>{input.tool.toUpperCase()}</div>
      </div>

      <div style={{ marginTop: 14, display: "flex" }}>
        <DashedRule />
      </div>

      {/* Outcome */}
      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          fontWeight: 700,
          color: MUTED,
        }}
      >
        OUTCOME
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 16,
          color: FG,
          lineHeight: 1.35,
          display: "flex",
        }}
      >
        {tldr}
      </div>

      <div style={{ marginTop: 14, display: "flex" }}>
        <DashedRule />
      </div>

      {/* Body */}
      <div style={{ marginTop: 10, fontSize: 13, color: FG, display: "flex", flexDirection: "column" }}>
        {input.commitSha ? (
          <div>commit {input.commitSha.slice(0, 7)}</div>
        ) : null}
        <div style={{ marginTop: 4 }}>
          {fileCount} file{fileCount === 1 ? "" : "s"} changed
        </div>
        <div style={{ marginTop: 2, color: MUTED, display: "flex", flexDirection: "column" }}>
          {shownFiles.map((f) => {
            const truncated = f.length > 52 ? "…" + f.slice(-51) : f;
            return (
              <div key={f} style={{ marginTop: 2 }}>
                {"  · "}
                {truncated}
              </div>
            );
          })}
          {fileCount > shownFiles.length ? (
            <div style={{ marginTop: 2 }}>
              {"  · +"}
              {fileCount - shownFiles.length} more
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, color: FG }}>
          {input.redactionCount} redaction{input.redactionCount === 1 ? "" : "s"}
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex" }}>
        <DashedRule />
      </div>

      {/* Spacer pushes footer to bottom */}
      <div style={{ flexGrow: 1, display: "flex" }} />

      {/* Footer badge */}
      <div style={{ display: "flex" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: badge.color,
            backgroundColor: withAlpha(badge.color, 0.12),
            padding: "10px 14px",
            borderRadius: 6,
          }}
        >
          {badge.glyph} {badge.label}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: MUTED }}>
        gettrail.dev/u/{input.handle}/{input.slug}
      </div>
    </div>
  );
}

export async function renderReceiptPng(input: ReceiptImageInput): Promise<Buffer> {
  const response = new ImageResponse(<ReceiptDoc {...input} />, {
    width: W,
    height: H,
  });
  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}
