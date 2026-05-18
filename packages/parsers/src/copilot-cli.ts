import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

// GitHub Copilot CLI session events:
//   ~/.copilot/session-state/<uuid>/events.jsonl
// Each line is an object {type, data, id, timestamp, parentId}.
// Sibling file workspace.yaml has session-level cwd/id/timestamps.
//
// Event types observed:
//   session.start         -> data.sessionId, data.context.cwd, data.startTime
//   session.model_change  -> ignore
//   system.message        -> skip (the persona)
//   user.message          -> data.content (prompt)
//   assistant.turn_start  -> ignore
//   assistant.message     -> data.content (completion) + data.toolRequests[]
//   tool.* / *.tool_*     -> tool calls / results (defensive)
//   assistant.turn_end    -> ignore
//   session.shutdown      -> use timestamp as endedAt

type AnyRec = Record<string, unknown>;

function readWorkspaceYaml(text: string): AnyRec {
  // Trivial flat YAML reader — workspace.yaml is `key: value` lines plus
  // block strings; we only need id/cwd/created_at/updated_at.
  const out: AnyRec = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim();
    if (!v || v === "|" || v === "|-" || v === ">") continue;
    out[m[1]] = v.replace(/^["']|["']$/g, "");
  }
  return out;
}

export async function parseCopilotCliSession(
  filePath: string,
  user: string,
): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let sessionId: string | undefined;
  let repo: string | undefined;

  const noteTime = (at?: string) => {
    if (!at) return;
    if (!startedAt || at < startedAt) startedAt = at;
    if (!endedAt || at > endedAt) endedAt = at;
  };

  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    let row: AnyRec;
    try {
      row = JSON.parse(line) as AnyRec;
    } catch {
      continue;
    }
    const type = typeof row.type === "string" ? row.type : "";
    const at = typeof row.timestamp === "string" ? row.timestamp : "";
    noteTime(at);
    const data = (row.data ?? {}) as AnyRec;

    if (type === "session.start") {
      if (typeof data.sessionId === "string") sessionId = data.sessionId;
      const ctx = (data.context ?? {}) as AnyRec;
      if (typeof ctx.cwd === "string") repo = ctx.cwd;
      if (typeof data.startTime === "string") noteTime(data.startTime);
      continue;
    }
    if (type === "user.message") {
      const text = typeof data.content === "string" ? data.content : "";
      if (text.trim()) events.push({ kind: "prompt", at, text });
      continue;
    }
    if (type === "assistant.message") {
      const text = typeof data.content === "string" ? data.content : "";
      if (text.trim()) events.push({ kind: "completion", at, text });
      const tr = Array.isArray(data.toolRequests) ? data.toolRequests : [];
      for (const t of tr) {
        const o = (t ?? {}) as AnyRec;
        const name =
          (typeof o.name === "string" && o.name) ||
          (typeof o.toolName === "string" && (o.toolName as string)) ||
          "tool";
        events.push({
          kind: "tool_call",
          at,
          name,
          args: o.arguments ?? o.args ?? o.input ?? {},
        });
      }
      continue;
    }
    // Defensive: tool result events seen in some versions
    if (type.startsWith("tool.") || type.endsWith(".tool_result")) {
      const name =
        (typeof data.name === "string" && data.name) ||
        (typeof data.toolName === "string" && (data.toolName as string)) ||
        "tool";
      events.push({
        kind: "tool_call",
        at,
        name,
        args: data.arguments ?? data.args ?? {},
        result: data.result ?? data.output ?? data.content,
      });
    }
  }

  // Try sibling workspace.yaml for richer metadata
  try {
    const wsPath = path.join(path.dirname(filePath), "workspace.yaml");
    const wsRaw = await readFile(wsPath, "utf8");
    const ws = readWorkspaceYaml(wsRaw);
    if (!sessionId && typeof ws.id === "string") sessionId = ws.id;
    if (!repo && typeof ws.cwd === "string") repo = ws.cwd;
    if (typeof ws.created_at === "string") noteTime(ws.created_at);
    if (typeof ws.updated_at === "string") noteTime(ws.updated_at);
  } catch {
    /* optional */
  }

  return {
    id: sessionId ?? path.basename(path.dirname(filePath)) ?? randomUUID(),
    user,
    tool: "copilot-cli",
    startedAt: startedAt ?? new Date().toISOString(),
    endedAt,
    repo,
    events,
  };
}
