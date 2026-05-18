import { z } from "zod";

export const ToolKind = z.enum(["claude-code", "codex", "cursor", "aider"]);

export const EventKind = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prompt"), at: z.string(), text: z.string() }),
  z.object({ kind: z.literal("completion"), at: z.string(), text: z.string() }),
  z.object({
    kind: z.literal("tool_call"),
    at: z.string(),
    name: z.string(),
    args: z.unknown(),
    result: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("file_diff"),
    at: z.string(),
    path: z.string(),
    before: z.string(),
    after: z.string(),
  }),
  z.object({ kind: z.literal("decision"), at: z.string(), note: z.string() }),
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
