import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Session, Event } from "@trail/schema";

// Codex CLI rollout JSONL format. Two variants observed in the wild:
//
//  (A) Legacy (early codex-cli, pre-rollout-event):
//        Line 1: {"id","timestamp","instructions",git:{...}}
//        Then:    {"type":"message","role":"user"|"assistant","content":[{type,text}...]}
//                 {"type":"reasoning","summary":[{type:"summary_text",text}]}
//                 {"record_type":"state"}
//
//  (B) Current (codex_cli_rs >= ~0.x): each line has {timestamp,type,payload}
//        type="session_meta"  -> payload.{id,timestamp,cwd,cli_version,...}
//        type="event_msg"     -> payload.type in {user_message, agent_message,
//                                  task_started, task_complete, token_count, ...}
//        type="response_item" -> payload.{type:"message"|"function_call"|"reasoning",...}
//
// We normalize both into the Trail Event union.

type AnyRec = Record<string, unknown>;

function asObj(v: unknown): AnyRec | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : undefined;
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      const blk = asObj(b);
      if (!blk) return "";
      const t = blk.type;
      if (
        (t === "input_text" || t === "output_text" || t === "text" || t === "summary_text") &&
        typeof blk.text === "string"
      ) {
        return blk.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function parseCodexSession(
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
  // Codex emits `model` inside response_item payloads. Track the most recent
  // observation so completion/tool_call events can be tagged with the model
  // that actually produced them (each turn may switch models in some flows).
  let currentModel: string | undefined;

  const noteTime = (at?: string) => {
    if (!at) return;
    if (!startedAt || at < startedAt) startedAt = at;
    if (!endedAt || at > endedAt) endedAt = at;
  };

  for (const line of lines) {
    let row: AnyRec;
    try {
      const parsed = JSON.parse(line);
      const o = asObj(parsed);
      if (!o) continue;
      row = o;
    } catch {
      continue;
    }

    const at =
      (typeof row.timestamp === "string" && row.timestamp) ||
      undefined;
    noteTime(at);

    // Variant A — header line
    if (typeof row.id === "string" && row.git !== undefined && !sessionId) {
      sessionId = row.id;
      const git = asObj(row.git);
      if (git && typeof git.repository_url === "string") repo = git.repository_url;
      continue;
    }

    const type = typeof row.type === "string" ? row.type : undefined;
    if (!type) continue;

    // Variant B — session_meta
    if (type === "session_meta") {
      const p = asObj(row.payload);
      if (p) {
        if (!sessionId && typeof p.id === "string") sessionId = p.id;
        if (!repo && typeof p.cwd === "string") repo = p.cwd;
        if (typeof p.timestamp === "string") noteTime(p.timestamp);
      }
      continue;
    }

    // Variant B — turn_context (precedes the turn it describes; carries the
    // active model for subsequent token_count/response_item events).
    if (type === "turn_context") {
      const p = asObj(row.payload);
      if (p && typeof p.model === "string" && p.model.length > 0) {
        currentModel = p.model;
      }
      continue;
    }

    // Variant B — event_msg
    if (type === "event_msg") {
      const p = asObj(row.payload);
      if (!p || typeof p.type !== "string") continue;
      const t = p.type;
      const ts = at ?? "";
      if (t === "user_message" && typeof p.message === "string" && p.message.trim()) {
        events.push({ kind: "prompt", at: ts, text: p.message });
      } else if (t === "agent_message" && typeof p.message === "string" && p.message.trim()) {
        events.push({
          kind: "completion",
          at: ts,
          text: p.message,
          ...(currentModel ? { model: currentModel } : {}),
        });
      } else if (t === "token_count") {
        // Codex tracks both cumulative (total_token_usage) and per-turn
        // (last_token_usage) counts. We attach last_token_usage to the most
        // recent assistant completion so trail_session aggregation sums them
        // turn-by-turn into trail_session.{input,output,cached}_tokens.
        // cache_creation_input_tokens isn't surfaced by codex (only OpenAI's
        // billing API distinguishes creation vs read), so we leave it null
        // and map cached_input_tokens → cacheReadInputTokens.
        const info = asObj(p.info);
        const last = info ? asObj(info.last_token_usage) : undefined;
        if (last) {
          const inputT = typeof last.input_tokens === "number" ? last.input_tokens : undefined;
          const outputT = typeof last.output_tokens === "number" ? last.output_tokens : undefined;
          const cachedT =
            typeof last.cached_input_tokens === "number" ? last.cached_input_tokens : undefined;
          // Find the most recent completion event and patch tokens onto it.
          for (let i = events.length - 1; i >= 0; i--) {
            const ev = events[i];
            if (ev && ev.kind === "completion") {
              if (inputT !== undefined && ev.inputTokens == null) ev.inputTokens = inputT;
              if (outputT !== undefined && ev.outputTokens == null) ev.outputTokens = outputT;
              if (cachedT !== undefined && ev.cacheReadInputTokens == null)
                ev.cacheReadInputTokens = cachedT;
              if (currentModel && ev.model == null) ev.model = currentModel;
              break;
            }
          }
        }
      }
      continue;
    }

    // Variant B — response_item
    if (type === "response_item") {
      const p = asObj(row.payload);
      if (!p) continue;
      // Track model whenever we see one — applies to subsequent completions
      // until the next response_item with a different model.
      if (typeof p.model === "string" && p.model.length > 0) {
        currentModel = p.model;
      }
      const pt = typeof p.type === "string" ? p.type : undefined;
      const ts = at ?? "";
      if (pt === "message") {
        const role = typeof p.role === "string" ? p.role : "";
        // skip developer/system noise; user prompts captured via event_msg
        if (role !== "assistant" && role !== "user") continue;
        const text = extractContentText(p.content);
        if (!text.trim()) continue;
        // skip giant AGENTS.md injected user messages (heuristic)
        if (role === "user" && text.length > 4000 && text.includes("AGENTS.md")) continue;
        events.push({
          kind: role === "assistant" ? "completion" : "prompt",
          at: ts,
          text,
          ...(role === "assistant" && currentModel ? { model: currentModel } : {}),
        });
      } else if (pt === "function_call") {
        const name = typeof p.name === "string" ? p.name : "unknown";
        let args: unknown = p.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            // keep as raw string
          }
        }
        events.push({
          kind: "tool_call",
          at: ts,
          name,
          args,
          ...(currentModel ? { model: currentModel } : {}),
        });
      }
      continue;
    }

    // Variant A — top-level message / reasoning
    if (type === "message") {
      const role = typeof row.role === "string" ? row.role : "";
      const text = extractContentText(row.content);
      if (!text.trim()) continue;
      if (role === "user") events.push({ kind: "prompt", at: at ?? "", text });
      else if (role === "assistant")
        events.push({ kind: "completion", at: at ?? "", text });
    }
  }

  const now = new Date().toISOString();
  return {
    id: sessionId ?? path.basename(filePath, ".jsonl") ?? randomUUID(),
    user,
    tool: "codex",
    startedAt: startedAt ?? now,
    endedAt,
    repo,
    events,
  };
}
