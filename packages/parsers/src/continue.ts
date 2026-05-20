import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

type Entry = {
  role?: string;
  content?: unknown;
  timestamp?: string | number;
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
          const blk = b as { type?: string; text?: string };
          if (blk.type === "text" && typeof blk.text === "string") return blk.text;
          if (typeof blk.text === "string") return blk.text;
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

export async function parseContinueSession(
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

  let history: Entry[] = [];
  let workspaceDirectory: string | undefined;
  let dateCreated: string | number | undefined;

  if (Array.isArray(data)) {
    history = data as Entry[];
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.history)) history = o.history as Entry[];
    if (typeof o.workspaceDirectory === "string") workspaceDirectory = o.workspaceDirectory;
    if (typeof o.dateCreated === "string" || typeof o.dateCreated === "number") {
      dateCreated = o.dateCreated as string | number;
    }
  }

  const sessionFallback = dateCreated !== undefined ? toIso(dateCreated, fallbackAt) : fallbackAt;

  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;

  history.forEach((m, i) => {
    if (!m || typeof m !== "object") return;
    // Preserve ordering: if no timestamp, add index ms to fallback
    let at: string;
    if (m.timestamp !== undefined) {
      at = toIso(m.timestamp, sessionFallback);
    } else {
      const base = new Date(sessionFallback).getTime();
      at = isNaN(base) ? sessionFallback : new Date(base + i).toISOString();
    }
    if (!startedAt || at < startedAt) startedAt = at;
    if (!endedAt || at > endedAt) endedAt = at;

    const text = extractText(m.content);
    if (m.role === "user" && text.trim()) {
      events.push({ kind: "prompt", at, text });
    } else if (m.role === "assistant" && text.trim()) {
      events.push({ kind: "completion", at, text });
    }
  });

  return {
    id: randomUUID(),
    user,
    tool: "continue",
    repo: workspaceDirectory,
    startedAt: startedAt ?? sessionFallback,
    endedAt: endedAt ?? startedAt ?? sessionFallback,
    events,
  };
}
