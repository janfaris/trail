// Deterministic thermal-receipt PNG renderer (Task 5.5).
//
// Renders a 600x900 PNG that looks like a paper thermal receipt. Used as
// the OG/Twitter image for /u/<handle>/<slug> share previews and as the
// downloadable receipt at /api/receipt/<id>/image.png. Deterministic:
// same input → byte-identical buffer.

import { Canvas, type CanvasRenderingContext2D as SkiaCtx } from "skia-canvas";

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

const MONO = "Menlo, Monaco, 'Courier New', monospace";

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + (line ? " " : "") + w).length > maxChars) {
      if (line) lines.push(line);
      line = w;
      if (lines.length >= maxLines) break;
    } else {
      line = line + (line ? " " : "") + w;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    const consumed = lines.join(" ").split(/\s+/).length;
    if (words.length > consumed) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] =
        last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + "…" : last + "…";
    }
  }
  return lines;
}

function statusBadge(status: ReceiptImageInput["status"]) {
  if (status === "shipped") return { glyph: "[x]", label: "SHIPPED", color: GREEN };
  if (status === "draft") return { glyph: "[~]", label: "DRAFT", color: AMBER };
  return { glyph: "[!]", label: "UNVERIFIED", color: GRAY };
}

export async function renderReceiptPng(input: ReceiptImageInput): Promise<Buffer> {
  const canvas = new Canvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = FG;
  ctx.textBaseline = "top";

  const padX = 36;
  let y = 40;

  // Header — TRAIL + filled bar + short id
  ctx.font = `bold 26px ${MONO}`;
  ctx.fillStyle = FG;
  ctx.fillText("TRAIL", padX, y);

  const barX = padX + 110;
  const barY = y + 12;
  ctx.fillRect(barX, barY, W - padX - barX - 80, 3);

  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`#${input.shortId}`, W - padX - 70, y + 8);

  y += 44;

  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = FG;
  ctx.fillText(input.date, padX, y);
  ctx.fillStyle = MUTED;
  const toolLabel = input.tool.toUpperCase();
  ctx.fillText(toolLabel, W - padX - ctx.measureText(toolLabel).width, y);

  y += 28;
  drawDashedRule(ctx, padX, y, W - padX);
  y += 18;

  ctx.font = `bold 12px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("OUTCOME", padX, y);
  y += 20;

  ctx.font = `16px ${MONO}`;
  ctx.fillStyle = FG;
  const tldrLines = wrap(input.tldr || "(no summary)", 48, 3);
  for (const l of tldrLines) {
    ctx.fillText(l, padX, y);
    y += 22;
  }
  y += 8;

  drawDashedRule(ctx, padX, y, W - padX);
  y += 18;

  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = FG;
  if (input.commitSha) {
    ctx.fillText(`commit ${input.commitSha.slice(0, 7)}`, padX, y);
    y += 20;
  }
  const fileCount = input.changedFiles.length;
  ctx.fillText(`${fileCount} file${fileCount === 1 ? "" : "s"} changed`, padX, y);
  y += 20;
  const shown = input.changedFiles.slice(0, 5);
  ctx.fillStyle = MUTED;
  for (const f of shown) {
    const truncated = f.length > 52 ? "…" + f.slice(-51) : f;
    ctx.fillText(`  · ${truncated}`, padX, y);
    y += 18;
  }
  if (fileCount > shown.length) {
    ctx.fillText(`  · +${fileCount - shown.length} more`, padX, y);
    y += 18;
  }
  ctx.fillStyle = FG;
  ctx.fillText(
    `${input.redactionCount} redaction${input.redactionCount === 1 ? "" : "s"}`,
    padX,
    y,
  );
  y += 24;

  drawDashedRule(ctx, padX, y, W - padX);

  // Footer badge — pinned to bottom area
  const badge = statusBadge(input.status);
  ctx.font = `bold 22px ${MONO}`;
  const badgeText = `${badge.glyph} ${badge.label}`;
  const bw = ctx.measureText(badgeText).width;
  const badgeY = H - 110;
  const padBX = 14;
  const padBY = 10;
  ctx.fillStyle = withAlpha(badge.color, 0.12);
  roundRect(ctx, padX, badgeY - padBY, bw + padBX * 2, 22 + padBY * 2, 6);
  ctx.fill();
  ctx.fillStyle = badge.color;
  ctx.fillText(badgeText, padX + padBX, badgeY - 4);

  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`gettrail.dev/u/${input.handle}/${input.slug}`, padX, H - 42);

  return await canvas.toBuffer("png");
}

function drawDashedRule(ctx: SkiaCtx, x: number, y: number, x2: number) {
  const dash = 6;
  const gap = 4;
  ctx.fillStyle = "#1a1a1a";
  for (let cx = x; cx < x2; cx += dash + gap) {
    ctx.fillRect(cx, y, dash, 1);
  }
}

function withAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function roundRect(
  ctx: SkiaCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
