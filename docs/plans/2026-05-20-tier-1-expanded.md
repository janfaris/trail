# Tier 1 Expanded — Cross-Tool Coverage + Session OG + Diff Viewer

**Goal:** Make Trail's "neutral cross-vendor layer" pitch honest by parsing the 6 missing major coding-agent tools, then ship session-level social cards and an in-app diff viewer.

**Architecture:** Each parser is a pure function `(filePath | options, user) → Promise<Session>` matching the existing pattern in `packages/parsers/src/claude-code.ts`. Schema in `packages/schema/src/index.ts` gets new `ToolKind` enum entries. Web app gets one new dynamic route (`opengraph-image.tsx` under session slug) and one new component (`<FileDiff/>`).

**Tech Stack:** TypeScript, Node 22, Zod schema, Next.js 15 App Router, `next/og`, `diff` npm lib for unified-diff rendering.

---

## Phase A — Schema + Tool Registry (foundation)

### Task A1: Extend ToolKind enum

**File:** `packages/schema/src/index.ts`

Add to `ToolKind` enum: `"windsurf"`, `"cline"`, `"continue"`, `"zed"`, `"opencode"` (aider already present).

**Verify:** `pnpm -F @trail/schema build` → no errors.

---

## Phase B — Parsers (6 new, follow `claude-code.ts` pattern)

Each parser:
- Lives in `packages/parsers/src/<tool>.ts`
- Exports `parse<Tool>Session(opts, user): Promise<Session>`
- Re-exported from `packages/parsers/src/index.ts`
- Has at least one fixture-based test in `packages/parsers/test/<tool>.test.ts`
- Maps source events to `prompt | completion | tool_call | file_diff | decision`

### Task B1: Aider parser
- Source: `.aider.chat.history.md` (markdown with `####` headers per turn)
- Format: `#### user_prompt\n\nresponse\n\n` blocks; file diffs appear as fenced code blocks tagged with file path
- Replace the stub at line 10-12 of `packages/parsers/src/index.ts` with real export

### Task B2: Windsurf parser
- Source: `~/.codeium/windsurf/conversations/*.json` OR workspace `.windsurf/sessions/*.json` (try both, prefer workspace)
- Each file = one session, JSON array of message objects `{role, content, timestamp, tool_calls?}`

### Task B3: Cline parser
- Source: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/<task_id>/`
- Each task dir contains `api_conversation_history.json` (full transcript) + `ui_messages.json` (UI events including diffs)
- Use `api_conversation_history.json` as primary; cross-reference `ui_messages.json` for `file_diff` events (tool name `replace_in_file` / `write_to_file`)

### Task B4: Continue parser
- Source: `~/.continue/sessions/*.json`
- Format: `{sessionId, title, history: [{role, content, contextItems?}], timestamp}`

### Task B5: Zed parser
- Source: `~/Library/Application Support/Zed/conversations/*.zed.json` (newer) or `~/.config/zed/conversations/` (Linux)
- Format: Zed serializes message threads as JSON with `messages: [{role, text, tool_uses?}]`

### Task B6: OpenCode parser
- Source: `~/.local/share/opencode/sessions/<id>/messages.jsonl` (one JSON per line)
- Format similar to Claude Code JSONL; map `user`/`assistant` roles + tool invocations

---

## Phase C — Web: Session OG + Diff Viewer

### Task C1: Session-level OG image

**File:** `apps/web/app/u/[user]/[slug]/opengraph-image.tsx` (NEW)

Mirror `apps/web/app/u/[user]/opengraph-image.tsx` pattern. Use shared helpers from `@/lib/og`. Render:
- Wordmark top-left
- Session title (large, 60–72px)
- Summary (2-line clamp, dim color)
- Tool badge (via `ToolSvg`) + `@handle` at bottom
- Event count + duration as small metadata

Query: `db.select().from(schema.trailSession).where(and(eq(slug,...), eq(userId,...)))` joined with `user`.

### Task C2: FileDiff component + integration

**Files:**
- `apps/web/components/file-diff.tsx` (NEW)
- `apps/web/app/u/[user]/[slug]/page.tsx` (MODIFY — render `<FileDiff>` for events where `kind === "file_diff"`)

Use `diff` npm package (`createTwoFilesPatch` → render as styled unified diff). Collapsed by default, expand on click. Syntax-highlighting deferred (Phase 5).

---

## Phase D — Wiring

### Task D1: CLI tool detection
**File:** `apps/cli/src/commands/record.ts`
Add detection branches for the 6 new tools (filesystem probes for their known paths) and call the matching parser.

### Task D2: ToolSvg icons
**File:** `apps/web/lib/og.tsx` (or wherever `ToolSvg` lives)
Add icon entries for `windsurf`, `cline`, `continue`, `zed`, `opencode`, `aider` (use simple monogram letters if no logo).

### Task D3: Ship
- `pnpm build` clean
- `pnpm -F @trail/parsers test` all green
- Commit per phase, single PR for the whole expansion
- Deploy via `vercel --prod`
