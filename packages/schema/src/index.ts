import { z } from "zod";

export const ToolKind = z.enum([
  "claude-code",
  "codex",
  "cursor",
  "aider",
  "hermes",
  "copilot-cli",
  "copilot-chat",
  "windsurf",
  "cline",
  "continue",
  "zed",
  "opencode",
]);

// Per-event token/model capture. Optional + nullable so older CLI clients
// that don't populate usage roundtrip cleanly (absence → undefined → NULL
// at insert time; we never coerce missing values to 0). Anthropic bills
// cache creation and cache read at different rates, so we keep them split
// here even though trail_session.cached_tokens aggregates them together.
const tokenAndModelFields = {
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  cacheCreationInputTokens: z.number().int().nonnegative().nullable().optional(),
  cacheReadInputTokens: z.number().int().nonnegative().nullable().optional(),
  model: z.string().min(1).max(200).nullable().optional(),
};

export const EventKind = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("prompt"),
    at: z.string(),
    text: z.string(),
    ...tokenAndModelFields,
  }),
  z.object({
    kind: z.literal("completion"),
    at: z.string(),
    text: z.string(),
    ...tokenAndModelFields,
  }),
  z.object({
    kind: z.literal("tool_call"),
    at: z.string(),
    name: z.string(),
    args: z.unknown(),
    result: z.unknown().optional(),
    ...tokenAndModelFields,
  }),
  z.object({
    kind: z.literal("file_diff"),
    at: z.string(),
    path: z.string(),
    before: z.string(),
    after: z.string(),
    ...tokenAndModelFields,
  }),
  z.object({
    kind: z.literal("decision"),
    at: z.string(),
    note: z.string(),
    ...tokenAndModelFields,
  }),
]);

export const Session = z.object({
  id: z.string(),
  user: z.string(),
  tool: ToolKind,
  startedAt: z.string(),
  endedAt: z.string().optional(),
  repo: z.string().optional(),
  events: z.array(EventKind),
  summary: z.string().optional(),
  shareSlug: z.string().optional(),
});

export type Session = z.infer<typeof Session>;
export type Event = z.infer<typeof EventKind>;
export type ToolKind = z.infer<typeof ToolKind>;
