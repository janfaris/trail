import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Event, Session } from "@trail/schema";

type Row = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  sessionId?: string;
  cwd?: string;
};

const MAX_TOOL_RESULT_CHARS = 12_000;

function capToolResult(value: string): string {
  return value.length > MAX_TOOL_RESULT_CHARS
    ? `${value.slice(0, MAX_TOOL_RESULT_CHARS)}\n<truncated:${value.length - MAX_TOOL_RESULT_CHARS} chars>`
    : value;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (b && typeof b === "object") {
          const blk = b as { type?: string; text?: string };
          if (blk.type === "text" && typeof blk.text === "string") return blk.text;
          // Intentionally skip tool_result blocks here. The Claude Code
          // .jsonl format echoes tool outputs back on user-role messages,
          // but those are NOT user prompts — they're the protocol's way of
          // returning tool results to the model. Including them here was
          // the root cause of recipes containing raw search JSON +
          // "REMINDER: You MUST include the sources above" assistant nudges
          // surfaced as if they were the first user prompt.
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractToolResultText(content: unknown): unknown {
  if (typeof content === "string") return capToolResult(content);
  if (Array.isArray(content)) {
    const text = content
      .map((b) => {
        if (!b || typeof b !== "object") return "";
        const blk = b as { type?: string; text?: string; content?: unknown };
        if (typeof blk.text === "string") return blk.text;
        if (typeof blk.content === "string") return blk.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) return capToolResult(text);
  }
  try {
    return capToolResult(JSON.stringify(content));
  } catch {
    return content;
  }
}

// Non-negative integer or null. Anything else (negative, NaN, string,
// missing) collapses to null so we never plant garbage in token columns.
function safeInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.trunc(v);
}

export async function parseClaudeCodeSession(filePath: string, user: string): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const events: Event[] = [];
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let repo: string | undefined;
  let sessionId: string | undefined;
  const pendingToolCalls = new Map<string, Extract<Event, { kind: "tool_call" }>>();

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
              const toolCall = b.tool_use_id ? pendingToolCalls.get(b.tool_use_id) : undefined;
              if (toolCall && toolCall.result === undefined) {
                toolCall.result = extractToolResultText(b.content);
              }
            }
          }
        }
      }
      const text = extractText(content);
      if (text.trim()) events.push({ kind: "prompt", at, text });
    } else if (row.type === "assistant" && row.message) {
      const content = row.message.content;
      // Token/model usage lives on the assistant message envelope. An
      // assistant message can fan out into multiple events (one per text or
      // tool_use block). Attach the message-level usage to the FIRST event
      // emitted from this message so the session-level sum is correct (no
      // double counting). Subsequent blocks from the same message get no
      // tokens but still carry the model name for per-event model attribution.
      const usage = row.message.usage;
      const model = typeof row.message.model === "string" ? row.message.model : null;
      const tokens = {
        inputTokens: safeInt(usage?.input_tokens),
        outputTokens: safeInt(usage?.output_tokens),
        cacheCreationInputTokens: safeInt(usage?.cache_creation_input_tokens),
        cacheReadInputTokens: safeInt(usage?.cache_read_input_tokens),
      };
      let firstBlockOfMessage = true;

      if (Array.isArray(content)) {
        for (const blk of content) {
          if (!blk || typeof blk !== "object") continue;
          const b = blk as {
            type?: string;
            id?: string;
            text?: string;
            name?: string;
            input?: unknown;
          };
          const usageForThisBlock = firstBlockOfMessage
            ? tokens
            : {
                inputTokens: null,
                outputTokens: null,
                cacheCreationInputTokens: null,
                cacheReadInputTokens: null,
              };
          if (b.type === "text" && b.text) {
            events.push({
              kind: "completion",
              at,
              text: b.text,
              model,
              ...usageForThisBlock,
            });
            firstBlockOfMessage = false;
          } else if (b.type === "tool_use") {
            const toolCall: Extract<Event, { kind: "tool_call" }> = {
              kind: "tool_call",
              at,
              name: String(b.name ?? "unknown"),
              args: b.input,
              model,
              ...usageForThisBlock,
            };
            events.push(toolCall);
            if (b.id) pendingToolCalls.set(b.id, toolCall);
            firstBlockOfMessage = false;
          }
        }
      } else {
        const text = extractText(content);
        if (text.trim()) {
          events.push({
            kind: "completion",
            at,
            text,
            model,
            ...tokens,
          });
        }
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
