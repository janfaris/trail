import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

type Row = {
  role?: string;
  content?: unknown;
  timestamp?: string;
  time?: string;
  created_at?: string;
  tool?: unknown;
  tool_call?: unknown;
  tool_use?: unknown;
  name?: string;
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

function extractToolUses(
  content: unknown,
): Array<{ name: string; args: unknown }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ name: string; args: unknown }> = [];
  for (const b of content) {
    if (b && typeof b === "object") {
      const blk = b as { type?: string; name?: string; input?: unknown };
      if (blk.type === "tool_use") {
        out.push({ name: String(blk.name ?? "unknown"), args: blk.input });
      }
    }
  }
  return out;
}

export async function parseOpenCodeSession(
  filePath: string,
  user: string,
): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;

  for (const line of lines) {
    let row: Row;
    try {
      row = JSON.parse(line) as Row;
    } catch {
      continue;
    }
    const at = row.timestamp ?? row.time ?? row.created_at ?? "";
    if (at) {
      if (!startedAt || at < startedAt) startedAt = at;
      if (!endedAt || at > endedAt) endedAt = at;
    }
    if (!at) continue;

    const text = extractText(row.content);
    if (row.role === "user" && text.trim()) {
      events.push({ kind: "prompt", at, text });
    } else if (row.role === "assistant" && text.trim()) {
      events.push({ kind: "completion", at, text });
    }

    for (const tu of extractToolUses(row.content)) {
      events.push({ kind: "tool_call", at, name: tu.name, args: tu.args });
    }

    const toolField = row.tool ?? row.tool_call ?? row.tool_use;
    if (toolField && typeof toolField === "object") {
      const t = toolField as { name?: string; args?: unknown; input?: unknown };
      events.push({
        kind: "tool_call",
        at,
        name: String(t.name ?? row.name ?? "unknown"),
        args: t.args ?? t.input,
      });
    } else if (typeof toolField === "string") {
      events.push({ kind: "tool_call", at, name: toolField, args: undefined });
    }
  }

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    user,
    tool: "opencode",
    startedAt: startedAt ?? now,
    endedAt,
    events,
  };
}
