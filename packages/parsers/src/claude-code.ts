import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

type Row = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  sessionId?: string;
  cwd?: string;
};

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (b && typeof b === "object") {
          const blk = b as { type?: string; text?: string; content?: unknown };
          if (blk.type === "text" && typeof blk.text === "string") return blk.text;
          if (blk.type === "tool_result") {
            if (typeof blk.content === "string") return blk.content;
            if (Array.isArray(blk.content)) return extractText(blk.content);
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export async function parseClaudeCodeSession(
  filePath: string,
  user: string,
): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let repo: string | undefined;
  let sessionId: string | undefined;

  for (const line of lines) {
    let row: Row;
    try {
      row = JSON.parse(line) as Row;
    } catch {
      continue;
    }
    const at = row.timestamp ?? "";
    if (at) {
      if (!startedAt || at < startedAt) startedAt = at;
      if (!endedAt || at > endedAt) endedAt = at;
    }
    if (row.sessionId && !sessionId) sessionId = row.sessionId;
    if (row.cwd && !repo) repo = row.cwd;

    if (!row.type || !at) continue;

    if (row.type === "user" && row.message) {
      const content = row.message.content;
      // user message can contain tool_result blocks; emit those as tool_call results plus the prompt text
      if (Array.isArray(content)) {
        for (const blk of content) {
          if (blk && typeof blk === "object") {
            const b = blk as { type?: string; tool_use_id?: string; content?: unknown };
            if (b.type === "tool_result") {
              // skip standalone tool_result here — handled via prior tool_use
            }
          }
        }
      }
      const text = extractText(content);
      if (text.trim()) events.push({ kind: "prompt", at, text });
    } else if (row.type === "assistant" && row.message) {
      const content = row.message.content;
      if (Array.isArray(content)) {
        for (const blk of content) {
          if (!blk || typeof blk !== "object") continue;
          const b = blk as { type?: string; text?: string; name?: string; input?: unknown };
          if (b.type === "text" && b.text) {
            events.push({ kind: "completion", at, text: b.text });
          } else if (b.type === "tool_use") {
            events.push({
              kind: "tool_call",
              at,
              name: String(b.name ?? "unknown"),
              args: b.input,
            });
          }
        }
      } else {
        const text = extractText(content);
        if (text.trim()) events.push({ kind: "completion", at, text });
      }
    }
  }

  const now = new Date().toISOString();
  return {
    id: sessionId ?? path.basename(filePath, ".jsonl") ?? randomUUID(),
    user,
    tool: "claude-code",
    startedAt: startedAt ?? now,
    endedAt,
    repo,
    events,
  };
}
