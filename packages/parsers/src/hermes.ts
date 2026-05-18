import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

// Hermes Agent session files: ~/.hermes/sessions/session_<ts>_<id>.json
// Single JSON object with top-level:
//   session_id, model, base_url, platform, session_start, last_updated,
//   system_prompt, tools, message_count, messages[]
// messages[] is OpenAI-shape: role in {system, user, assistant, tool},
//   assistant rows may carry content + tool_calls[{id,function:{name,arguments}}].
//   tool rows: {role:"tool", name, content, tool_call_id}.

type AnyRec = Record<string, unknown>;

interface HermesFile {
  session_id?: string;
  session_start?: string;
  last_updated?: string;
  messages?: AnyRec[];
  cwd?: string;
}

function toIso(s: string | undefined): string | undefined {
  if (!s) return undefined;
  // hermes writes naive datetimes like "2026-05-18T13:23:48.877709".
  // Treat as local time; Date will parse it as local — convert to ISO.
  // If it already ends in Z or has tz offset, Date handles it.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString();
}

export async function parseHermesSession(
  filePath: string,
  user: string,
): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const doc = JSON.parse(raw) as HermesFile;
  const events: Event[] = [];
  const startedAt =
    toIso(doc.session_start) ?? new Date().toISOString();
  const endedAt = toIso(doc.last_updated);

  // Map tool_call_id → name so we can label tool result events.
  const toolCallNames = new Map<string, string>();

  // Step monotonic time — message-level timestamps aren't stored per-message.
  // We anchor at startedAt and increment by 1s per event so ordering is stable.
  let stepMs = new Date(startedAt).getTime();
  const nextAt = () => {
    const at = new Date(stepMs).toISOString();
    stepMs += 1000;
    return at;
  };

  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  for (const m of messages) {
    const role = typeof m.role === "string" ? m.role : "";
    if (role === "system") continue;

    if (role === "user") {
      const c = m.content;
      const text = typeof c === "string" ? c : JSON.stringify(c ?? "");
      if (text.trim()) events.push({ kind: "prompt", at: nextAt(), text });
      continue;
    }

    if (role === "assistant") {
      const c = m.content;
      const text = typeof c === "string" ? c : "";
      if (text.trim()) events.push({ kind: "completion", at: nextAt(), text });
      const tcs = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      for (const tc of tcs) {
        const o = (tc ?? {}) as AnyRec;
        const fn = (o.function ?? {}) as AnyRec;
        const name = typeof fn.name === "string" ? fn.name : "unknown";
        let args: unknown = fn.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            /* keep raw */
          }
        }
        const id = typeof o.id === "string" ? o.id : undefined;
        if (id) toolCallNames.set(id, name);
        events.push({ kind: "tool_call", at: nextAt(), name, args });
      }
      continue;
    }

    if (role === "tool") {
      const tcid = typeof m.tool_call_id === "string" ? m.tool_call_id : "";
      const name =
        (typeof m.name === "string" && m.name) ||
        (tcid ? toolCallNames.get(tcid) : undefined) ||
        "tool_result";
      let result: unknown = m.content;
      if (typeof result === "string") {
        try {
          result = JSON.parse(result);
        } catch {
          /* keep raw string */
        }
      }
      // Attach to the last matching tool_call if found; else emit a new one.
      let attached = false;
      if (tcid) {
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i];
          if (ev.kind === "tool_call" && ev.name === name && ev.result === undefined) {
            ev.result = result;
            attached = true;
            break;
          }
        }
      }
      if (!attached) {
        events.push({ kind: "tool_call", at: nextAt(), name, args: {}, result });
      }
    }
  }

  return {
    id: doc.session_id ?? path.basename(filePath, ".json") ?? randomUUID(),
    user,
    tool: "hermes",
    startedAt,
    endedAt,
    repo: doc.cwd,
    events,
  };
}
