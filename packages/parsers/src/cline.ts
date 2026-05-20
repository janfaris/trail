import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Session, Event } from "@trail/schema";

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

type ApiMsg = { role?: string; content?: unknown };
type UiMsg = {
  ts?: number;
  type?: string;
  say?: string;
  ask?: string;
  text?: string;
  tool?: string;
};

export async function parseClineTask(taskDir: string, user: string): Promise<Session> {
  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;

  const touch = (at: string) => {
    if (!at) return;
    if (!startedAt || at < startedAt) startedAt = at;
    if (!endedAt || at > endedAt) endedAt = at;
  };

  // api_conversation_history.json — array of {role, content}
  const apiPath = path.join(taskDir, "api_conversation_history.json");
  let apiRaw: string | undefined;
  try {
    apiRaw = await readFile(apiPath, "utf8");
  } catch {
    // optional
  }

  // ui_messages.json carries timestamps; map them to API messages by index of user/assistant turns when possible
  const uiPath = path.join(taskDir, "ui_messages.json");
  let uiMsgs: UiMsg[] = [];
  try {
    const uiRaw = await readFile(uiPath, "utf8");
    const parsed = JSON.parse(uiRaw);
    if (Array.isArray(parsed)) uiMsgs = parsed as UiMsg[];
  } catch {
    // optional
  }

  // Default timestamp = earliest ui ts or now
  const uiTimestamps = uiMsgs
    .map((m) => (typeof m.ts === "number" ? m.ts : NaN))
    .filter((n) => Number.isFinite(n)) as number[];
  const baseTs = uiTimestamps.length ? Math.min(...uiTimestamps) : Date.now();
  const isoOf = (n: number) => new Date(n).toISOString();

  if (apiRaw) {
    let api: ApiMsg[] = [];
    try {
      const parsed = JSON.parse(apiRaw);
      if (Array.isArray(parsed)) api = parsed as ApiMsg[];
    } catch {
      // ignore
    }
    let i = 0;
    for (const msg of api) {
      const at = isoOf(baseTs + i);
      touch(at);
      i += 1;
      if (msg.role === "user") {
        const text = extractText(msg.content);
        if (text.trim()) events.push({ kind: "prompt", at, text });
      } else if (msg.role === "assistant") {
        const content = msg.content;
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
  }

  for (const m of uiMsgs) {
    if (!m || typeof m !== "object") continue;
    if (m.tool !== "replace_in_file" && m.tool !== "write_to_file") {
      // tool info may also be embedded in text JSON for say:"tool"
      if ((m.say === "tool" || m.ask === "tool") && typeof m.text === "string") {
        try {
          const parsed = JSON.parse(m.text) as {
            tool?: string;
            path?: string;
            diff?: string;
            content?: string;
          };
          if (parsed.tool === "replace_in_file" || parsed.tool === "write_to_file") {
            const at = typeof m.ts === "number" ? isoOf(m.ts) : isoOf(baseTs);
            touch(at);
            const after =
              parsed.tool === "write_to_file"
                ? parsed.content ?? ""
                : parsed.diff ?? parsed.content ?? "";
            events.push({
              kind: "file_diff",
              at,
              path: parsed.path ?? "",
              before: "",
              after,
            });
          }
        } catch {
          // ignore
        }
      }
      continue;
    }
    const at = typeof m.ts === "number" ? isoOf(m.ts) : isoOf(baseTs);
    touch(at);
    const after =
      m.tool === "write_to_file"
        ? (m as unknown as { content?: string }).content ?? ""
        : (m as unknown as { diff?: string; content?: string }).diff ??
          (m as unknown as { content?: string }).content ??
          "";
    events.push({
      kind: "file_diff",
      at,
      path: (m as unknown as { path?: string }).path ?? "",
      before: "",
      after,
    });
  }

  const now = new Date().toISOString();
  return {
    id: path.basename(taskDir),
    user,
    tool: "cline",
    startedAt: startedAt ?? now,
    endedAt,
    events,
  };
}
