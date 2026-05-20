import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

type Msg = {
  role?: string;
  content?: unknown;
  text?: string;
  timestamp?: string | number;
  tool_uses?: unknown;
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
          const blk = b as { type?: string; text?: string; content?: unknown };
          if (blk.type && blk.type !== "text") return "";
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

export async function parseZedSession(
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
    if (Array.isArray(o.messages)) {
      messages = o.messages as Msg[];
    } else if (
      o.conversation &&
      typeof o.conversation === "object" &&
      Array.isArray((o.conversation as Record<string, unknown>).messages)
    ) {
      messages = (o.conversation as { messages: Msg[] }).messages;
    }
  }

  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;

  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const at = toIso(m.timestamp, fallbackAt);
    if (!startedAt || at < startedAt) startedAt = at;
    if (!endedAt || at > endedAt) endedAt = at;

    const text = extractText(m.text ?? m.content);
    if (m.role === "user" && text.trim()) {
      events.push({ kind: "prompt", at, text });
    } else if (m.role === "assistant" && text.trim()) {
      events.push({ kind: "completion", at, text });
    }

    if (Array.isArray(m.tool_uses)) {
      for (const tc of m.tool_uses) {
        if (!tc || typeof tc !== "object") continue;
        const t = tc as {
          name?: string;
          tool?: string;
          arguments?: unknown;
          input?: unknown;
          parameters?: unknown;
        };
        const name = t.name ?? t.tool ?? "unknown";
        const args = t.arguments ?? t.input ?? t.parameters;
        events.push({ kind: "tool_call", at, name: String(name), args });
      }
    }
  }

  return {
    id: randomUUID(),
    user,
    tool: "zed",
    startedAt: startedAt ?? fallbackAt,
    endedAt: endedAt ?? startedAt ?? fallbackAt,
    events,
  };
}
