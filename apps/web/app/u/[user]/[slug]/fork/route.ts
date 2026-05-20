export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { eq, and, asc } from "drizzle-orm";
import { deriveTitle } from "@/lib/derive-title";
import type { EventData } from "@/components/timeline-event";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ user: string; slug: string }> },
) {
  const { user, slug } = await params;

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
  });
  if (!userRow) return new Response("Not found", { status: 404 });

  const sessionRow = await db.query.trailSession.findFirst({
    where: and(
      eq(schema.trailSession.userId, userRow.id),
      eq(schema.trailSession.slug, slug),
    ),
  });
  if (!sessionRow) return new Response("Not found", { status: 404 });

  const events = await db
    .select()
    .from(schema.event)
    .where(eq(schema.event.sessionId, sessionRow.id))
    .orderBy(asc(schema.event.idx));

  const promptEvents = events.filter(
    (e) => (e.data as EventData).kind === "prompt",
  );

  const keyPromptIdxs = sessionRow.recipeKeyPromptIdxs;
  const keyPrompts =
    keyPromptIdxs && keyPromptIdxs.length > 0
      ? events.filter(
          (e) =>
            keyPromptIdxs.includes(e.idx) &&
            (e.data as EventData).kind === "prompt",
        )
      : promptEvents.slice(0, 3);

  const firstPrompt = promptEvents[0];
  const firstPromptText =
    firstPrompt && (firstPrompt.data as EventData).kind === "prompt"
      ? (firstPrompt.data as { kind: "prompt"; text: string }).text
      : "";

  const title = sessionRow.title || deriveTitle(firstPromptText, sessionRow.slug);

  const keyPromptsBlock = keyPrompts
    .map((e, i) => {
      const d = e.data as EventData;
      const text = d.kind === "prompt" ? d.text : "";
      return `${i + 1}. ${text}`;
    })
    .join("\n");

  const markdown = `# ${title}

> Forked from https://gettrail.vercel.app/u/${user}/${slug}

**Tool:** ${sessionRow.tool}  · **Outcome:** ${sessionRow.recipeOutcome ?? "—"}

## TL;DR
${sessionRow.recipeTldr ?? "(no recipe generated yet)"}

## Setup prompt
${firstPromptText}

## Key prompts
${keyPromptsBlock}

## How to use
1. Open this in your AI coding tool of choice (Claude Code, Cursor, Codex, Windsurf, Cline, Continue, Zed, OpenCode, Aider, or Hermes).
2. Paste the Setup prompt to seed the session.
3. Run the Key prompts in order, adapting paths/values to your project.
4. Share your run back at https://gettrail.vercel.app
`;

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="trail-${slug}.md"`,
    },
  });
}
