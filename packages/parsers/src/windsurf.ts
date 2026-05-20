import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

type Msg = {
  role?: string;
  content?: unknown;
  text?: string;
  timestamp?: string | number;
  time?: string | number;
  created_at?: string | number;
  tool_calls?: unknown;
};

function toIso(t: unknown, fallback: string): string {
  if (typeof t === "string" && t) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toISOString();
    return t;
  }
  if (typeof t === "number" && t > 0) {
    const ms = t < 1e12 ? t * 1000 : t;
    return new Date(ms).toISOString();
  }
  return fallback;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object") {
          const blk = b as { text?: string; content?: unknown };
          if (typeof blk.text === "string") return blk.text;
          if (typeof blk.content === "string") return blk.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    const c = content as { text?: string };
    if (typeof c.text === "string") return c.text;
  }
  return "";
}

export async function parseWindsurfSession(
  filePath: string,
  user: string,
): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const st = await stat(filePath);
  const fallbackAt = st.mtime.toISOString();

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  let messages: Msg[] = [];
  if (Array.isArray(data)) {
    messages = data as Msg[];
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["messages", "history", "conversation"]) {
      const v = o[key];
      if (Array.isArray(v)) {
        messages = v as Msg[];
        break;
      }
    }
  }

  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;

  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const rawTs = m.timestamp ?? m.time ?? m.created_at;
    const at = toIso(rawTs, fallbackAt);
    if (!startedAt || at < startedAt) startedAt = at;
    if (!endedAt || at > endedAt) endedAt = at;

    const text = extractText(m.content ?? m.text);
    if (m.role === "user" && text.trim()) {
      events.push({ kind: "prompt", at, text });
    } else if (m.role === "assistant" && text.trim()) {
      events.push({ kind: "completion", at, text });
    }

    if (Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (!tc || typeof tc !== "object") continue;
        const t = tc as {
          name?: string;
          function?: { name?: string; arguments?: unknown };
          arguments?: unknown;
          input?: unknown;
        };
        const name = t.name ?? t.function?.name ?? "unknown";
        const args = t.function?.arguments ?? t.arguments ?? t.input;
        events.push({ kind: "tool_call", at, name: String(name), args });
      }
    }
  }

  return {
    id: randomUUID(),
    user,
    tool: "windsurf",
    startedAt: startedAt ?? fallbackAt,
    endedAt: endedAt ?? startedAt ?? fallbackAt,
    events,
  };
}
