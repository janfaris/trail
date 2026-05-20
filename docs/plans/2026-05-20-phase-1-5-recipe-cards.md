# Phase 1.5 — Recipe Cards, Highlights, Fork Setup

**Goal:** Turn the session page from "wall of transcript" into a scannable, forkable, share-worthy artifact that delivers on the original tweet ("proof-of-work + portfolio + how they think + fork from here").

**Architecture:** Add 4 nullable columns to `trail_session` for AI-derived recipe metadata. A background generator (existing AI pipeline pattern) fills them once per session. Session page gets: (1) Recipe Card section at top, (2) default-collapsed timeline with Highlights toggle, (3) Fork button that downloads a markdown starter pack.

**Tech Stack:** Drizzle migration, gpt-5.4-mini (Azure), Next.js 15 server components, Tailwind.

---

## Task 1: DB migration — recipe columns

**File:** `apps/web/db/schema.ts`

Add to `trailSession` table:
- `recipeTldr: text("recipe_tldr")` — 1-sentence outcome
- `recipeOutcome: text("recipe_outcome")` — concrete artifact ("Pricing report", "3 files changed")
- `recipeKeyPromptIdxs: jsonb("recipe_key_prompt_idxs").$type<number[]>()` — event.idx values of 3-5 pivotal prompts
- `recipeHighlightIdxs: jsonb("recipe_highlight_idxs").$type<number[]>()` — event.idx values of 3-7 pivotal events
- `recipeGeneratedAt: timestamp("recipe_generated_at")`

Run `pnpm -F @trail/web exec drizzle-kit generate` then commit migration files.

---

## Task 2: Recipe generator

**File NEW:** `apps/web/lib/recipe-gen.ts`

Export `generateRecipe(sessionId: string): Promise<void>`. Load session + all events, build a compact prompt for `gpt-5.4-mini` asking for JSON:
```json
{ "tldr": "...", "outcome": "...", "keyPromptIdxs": [0, 4, 12], "highlightIdxs": [0, 1, 4, 11, 12, 28] }
```
Constraints: tldr ≤ 140 chars, outcome ≤ 40 chars, keyPromptIdxs 3-5 picks (must reference real prompt events), highlightIdxs 3-7 picks. Persist all 5 fields + `recipeGeneratedAt = now()`.

Wire into the existing AI pipeline call site (look for where `aiExplanation` is generated; piggyback).

---

## Task 3: RecipeCard component

**File NEW:** `apps/web/components/recipe-card.tsx`

Server component. Props: `{ session, keyPrompts: EventData[] }`. Renders:
- Outcome chip top-right (small pill, accent color)
- TL;DR heading (~24px)
- "Key prompts" section: 3-5 copyable prompt cards (use existing CopyButton pattern)
- "Setup" row: tool icon + tool name + model + repo path

Use bg-zinc-900 surface, zinc-800 border, accent #a7f300 for outcome chip.

---

## Task 4: Fork button + download endpoint

**Files:**
- NEW `apps/web/components/fork-button.tsx` (client component) — button that calls `/u/[user]/[slug]/fork` and triggers download
- NEW `apps/web/app/u/[user]/[slug]/fork/route.ts` — GET returns `text/markdown` attachment

Markdown payload structure:
```markdown
# {title}

> Forked from trail.dev/u/{handle}/{slug}

**Tool:** {tool}  · **Model:** {model if any} · **Outcome:** {outcome}

## TL;DR
{recipeTldr}

## System / context
{first system/setup prompt verbatim}

## Key prompts
1. {keyPrompt 1}
2. ...

## How to use
1. Open this in your AI coding tool of choice (Claude Code, Cursor, Codex…)
2. Paste the system prompt, then run the key prompts in order
3. Share your run back at trail.dev
```

Filename: `trail-{slug}.md`, Content-Disposition: attachment.

---

## Task 5: Highlights-default timeline

**File:** `apps/web/app/u/[user]/[slug]/page.tsx`

- If `recipeHighlightIdxs` exists, filter events to only those indices for the default view.
- Add a client-side toggle `<TimelineToggle eventCount={total} />` (new client component) — "Show all N events" button that re-renders the full timeline. Use a simple `?full=1` query param toggle (or `useState` if we want no flicker — pick whichever is faster).
- Mount `<RecipeCard>` above the timeline.
- Mount `<ForkButton>` next to the existing Copy/Share buttons.

If no recipe yet (legacy session), show full timeline as before and a "Generating recipe…" badge.

---

## Task 6: Backfill existing sessions

**File NEW:** `apps/web/scripts/backfill-recipes.ts`

Iterate all `trailSession` rows where `recipeGeneratedAt IS NULL`, call `generateRecipe(id)`, sleep 500ms between calls. Add npm script `recipes:backfill`.

Run once after deploy: `pnpm -F @trail/web recipes:backfill`.

---

## Task 7: Ship

- `pnpm -F @trail/web build` clean
- Commit per task
- Push + `vercel --prod`
- Backfill
- Reload `gettrail.vercel.app/u/jankarlo.faris/057smo2q` — confirm Recipe Card + Highlights + Fork button visible
