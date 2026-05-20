# Trail — From Recorder to Movement

Plan for evolving Trail (https://gettrail.vercel.app, repo: janfaris/trail) into
(a) the default place AI vibe coders share working sessions and (b) the default
dev portfolio for "this is how I code with AI." Plus closing the redaction holes
that gate everything else.

Author: Jan + Hermes
Created: 2026-05-20

---

## Goal

Two product jobs, served by one capture pipeline:

- **JOB A — Learner search.** A rookie types "subagents in Claude Code with
  Supabase MCP", gets a verified working session, clicks **Open in Claude
  Code** (or Cursor / Codex / Hermes), and continues from where the original
  dev left off.
- **JOB B — AI-coding portfolio.** A senior dev pastes
  `trail.janfaris.com` into a recruiter chat and the page proves how they
  work with AI — receipts, shipped PRs, skill graph, streak, endorsements.

Non-negotiable gate: **no env vars, secrets, or PII ever leak** in the
process. Phase 0 ships before any growth surface.

---

## Current state (audited 2026-05-20)

What already exists in the repo:

- **Capture / parsers** — `packages/parsers/src` covers 12 tools:
  claude-code, codex, cursor, aider, hermes, copilot-cli, copilot-chat,
  windsurf, cline, continue, zed, opencode.
- **Schema** — `packages/schema/src` defines Session + Event
  (prompt / completion / tool_call / file_diff / decision).
- **Anonymizer** — `packages/anonymize/src` has 11 detectors
  (Anthropic, OpenAI, GitHub, Stripe, AWS, JWT, email, home path,
  internal host) + deep object walk + post-scrub schema re-validation.
- **Hosted backend** — Next.js 15 + Neon Postgres + Drizzle + better-auth
  + pgvector (1536-dim HNSW). Now wired to Azure OpenAI Foundry
  (gpt-5.4-mini + text-embedding-3-small).
- **Surfaces** — `/`, `/discover`, `/search`, `/u/[user]`, `/u/[user]/[slug]`,
  `/install`, `/settings`, `/cli-auth`.
- **Recipes** — per-session columns: `recipeTldr`, `recipeOutcome`,
  `recipeKeyPromptIdxs`, `recipeHighlightIdxs`,
  + metrics: `languages`, `durationSeconds`, `toolCallCounts`,
  `distinctFiles`, `promptCount`, `failedToolCalls`, `embedding`.
- **Fork** — `/u/[user]/[slug]/fork` returns a markdown recipe
  (title, TLDR, setup prompt, key prompts, generic "open in your tool").
- **CLI** — `apps/cli/src` with `record`, `share`, `view`, `search`, `auth`.

What's missing (mapped to the killer demo "fork a working session into your
terminal in one click"):

- No taxonomy beyond `tool` — can't filter by MCP server, framework,
  task type, outcome.
- Recipes are stored but not surfaced as the primary view.
- `fork` returns markdown only — no deep-link buttons, no auto-detect.
- Profile is sessions-only — no PR/commit receipts, no skill graph,
  no streak, no interview view.
- Redaction misses Azure / Postgres URL / Google / HF / Slack / Vercel /
  Linear / Sentry / Twilio / SendGrid / Mailgun / Clerk / Replicate, and
  there is no generic `KEY=VALUE` catcher, no entropy guard, no
  preview-before-publish, no retroactive redaction.
- No growth loops — no oEmbed, no embed iframe, no weekly digest,
  no leaderboard, no RSS, no public API, no cross-post.

---

## Approach (one line per phase)

- **Phase 0 — Trust.** Close every redaction hole; preview before publish.
- **Phase 1 — Learner.** Taxonomy + facets + one-click fork into tool.
- **Phase 2 — Portfolio.** PR receipts + skill graph + interview view.
- **Phase 3 — Growth.** oEmbed, embed, digest, leaderboard, public API.

Each phase is shippable on its own. Phase 0 is a hard prerequisite.

---

## Phase 0 — Trust (gate before anything else)

### Goals
1. Catch every env var / secret category we know about, by **shape** (named
   provider) **and** by **role** (`KEY=VALUE`).
2. Catch unknown high-entropy tokens before they hit the network.
3. Show the user exactly what will be uploaded, with a diff, and require
   explicit confirmation.
4. Allow retroactive strike.

### Concrete tasks

0.1 **Expand named-provider detectors** in
`packages/anonymize/src/detectors.ts`:
   - Azure OpenAI: hex-32 after `AZURE_OPENAI_API_KEY[=:]`
   - Google / Gemini: `AIza[0-9A-Za-z_\-]{35}`
   - Hugging Face: `hf_[A-Za-z0-9]{30,}`
   - Slack: `xox[abps]-[A-Za-z0-9\-]{10,}`
   - Linear: `lin_api_[A-Za-z0-9]{40}`
   - Sentry DSN: `https://[a-f0-9]{32}@[^/]+\.ingest\.sentry\.io/\d+`
   - Twilio: `AC[a-f0-9]{32}`, `SK[a-f0-9]{32}`
   - SendGrid: `SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}`
   - Mailgun: `key-[a-f0-9]{32}`
   - Clerk: `sk_(live|test)_[A-Za-z0-9]{32,}`, `pk_(live|test)_[A-Za-z0-9]{32,}`
   - Replicate: `r8_[A-Za-z0-9]{40}`
   - Together / Fireworks / Groq / Perplexity / DeepSeek / Mistral
     (each has a documented prefix — add)
   - Postgres / Mongo / Redis URL with embedded creds:
     `(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis(?:s)?)://[^:\s]+:[^@\s]+@[^\s]+`
     → preserve scheme + host, redact userinfo
   - Vercel token (no prefix) — covered by the generic detector below

0.2 **Generic `KEY=VALUE` detector** in the same file:
   - Pattern: `\b(API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?KEY|AUTH[_-]?TOKEN|BEARER|DATABASE[_-]?URL|DB[_-]?URL|CONNECTION[_-]?STRING)\s*[:=]\s*['"]?([^\s'"]{8,})`
   - Replace value with `<redacted:env-value>`; preserve key name.
   - Run **after** named detectors so we don't double-tag.

0.3 **Entropy guard** in `packages/anonymize/src/entropy.ts` (new):
   - For each surviving token of length ≥ 24 in scrubbed strings, compute
     Shannon entropy. If > 4.5 bits and matches `[A-Za-z0-9_\-+/=]+`,
     mark as a potential leak.
   - Return as part of `RedactionReport.suspects: string[]` (one
     entry per location). Upload **blocks** if `suspects.length > 0`
     unless the user passed `--allow-suspects`.

0.4 **LLM PII flag** in `apps/web/lib/openai.ts` (new export
`flagSensitive`):
   - Reuse Azure gpt-5.4-mini call. Prompt: "Return JSON `{has_secrets,
     reasons}`. has_secrets=true if anything looks like a credential,
     personal address, phone number, internal URL, or proprietary
     code marker. reasons=array of 1-line strings."
   - On `has_secrets=true`, mark session `pendingReviewReasons` and do
     not list publicly until owner confirms.
   - Cost: ~$0.0001 / session.

0.5 **CLI preview before publish** in `apps/cli/src/commands/share.ts`:
   - After local anonymize, write `/tmp/trail-preview-<slug>.html`:
     side-by-side diff (left: local original, right: what uploads),
     redaction badges per category, suspects highlighted in red.
   - Open in default browser (`open` on macOS, `xdg-open` on Linux).
   - Prompt: `Confirm upload? [y/N]`. Default no.
   - Flags:
     - `--prompts-only` (drop tool_call args + file_diff before/after)
     - `--no-diffs`
     - `--no-tool-args`
     - `--allow-suspects`
     - `--yes` (skip prompt; opt-in only)

0.6 **Server-side defense in depth** in
`apps/web/app/api/sessions/upload/route.ts`:
   - Already calls `anonymize()` — keep.
   - Also call `flagSensitive` on the scrubbed payload; on
     `has_secrets=true`, store `pendingReviewReasons` and set
     `visibility = 'pending'` (new column).
   - Reject upload if scrubbed payload still contains entropy suspects
     AND request didn't include `allow-suspects: true`.

0.7 **Retroactive redaction endpoint**
`apps/web/app/api/sessions/[slug]/redact/route.ts`:
   - Owner-only (better-auth check).
   - Body: `{ eventIdx?: number, substring?: string, replacement?: string }`.
   - Rewrites `event.data` in place; revalidates `/u/[user]/[slug]`;
     bumps `redactedAt`.
   - Returns count of replacements applied.

0.8 **Migrate existing trails** — script
`apps/web/scripts/backfill-redactions.ts`:
   - Iterate every public session, re-run new detectors dry-run, log
     diff. Owner-approved auto-apply for the obvious wins (named
     providers); flag the rest for manual review.

### Schema additions (Phase 0)

```
ALTER TABLE trail_session ADD COLUMN visibility text NOT NULL DEFAULT 'public';
  -- 'public' | 'pending' | 'private' | 'redacted'
ALTER TABLE trail_session ADD COLUMN pending_review_reasons jsonb;
ALTER TABLE trail_session ADD COLUMN redacted_at timestamp;
```

### Tests (Phase 0)

- `packages/anonymize/test/detectors.spec.ts` — golden cases per
  provider, KEY=VALUE catcher, postgres URL, entropy edge cases.
- Negative cases: don't redact normal sentences with high-entropy
  English (e.g. "supercalifragilistic"), don't redact public Supabase
  project URLs, don't redact common UUIDs.
- Integration: replay the Azure-key conversation we had in this
  session through the pipeline; assert the key never appears in the
  serialized output.

### Files likely to change

- `packages/anonymize/src/detectors.ts` (expand)
- `packages/anonymize/src/entropy.ts` (new)
- `packages/anonymize/src/index.ts` (wire entropy + suspects into
  `RedactionReport`)
- `packages/anonymize/test/` (new tests)
- `apps/web/lib/openai.ts` (add `flagSensitive`)
- `apps/web/app/api/sessions/upload/route.ts`
- `apps/web/app/api/sessions/[slug]/redact/route.ts` (new)
- `apps/web/db/schema.ts` + new drizzle migration
- `apps/cli/src/commands/share.ts` (preview + flags)
- `apps/web/scripts/backfill-redactions.ts` (new)

### Phase 0 exit criteria

- `pnpm test` passes with new test suite.
- `trail share` on a session containing Azure key + Postgres URL
  + Slack token shows the preview, blocks upload until confirmed,
  redacts all three.
- Existing public trails replayed through new detectors — diff
  committed to a one-off PR for human review before bulk-applying.

---

## Phase 1 — Learner (the Job A surface)

### Goals
1. A beginner can answer "how do I do X with tool Y" in under 30 seconds.
2. They can fork the winning session into their installed AI tool in
   one click.

### Concrete tasks

1.1 **Taxonomy on upload** — extend the existing AI tag pass:
   - Add columns `tools_used text[]`, `frameworks text[]`,
     `task_type text`, `models text[]`, `outcome text` to
     `trail_session`.
   - Re-use the gpt-5.4-mini call in `apps/web/lib/openai.ts`:
     return `{ title, summary, tools_used, frameworks, task_type,
     models, outcome }` in one structured-output call.
   - GIN indexes on each array column.
   - Backfill script for existing rows.

1.2 **/learn surface** (`apps/web/app/learn/page.tsx`):
   - Faceted filters: tool × framework × task_type × outcome
     (default `outcome = shipped`).
   - Server component, no client JS for the filter list itself.
   - Search params drive the query.
   - Top of the page: "Trails for X with Y" if a single filter
     is selected — turns generic search into "guide pages."

1.3 **Recipe-first session view** — refactor
`apps/web/app/u/[user]/[slug]/page.tsx`:
   - Tabs: `Recipe` (default) | `Timeline` | `Diffs` | `Raw`.
   - Recipe tab uses `recipeKeyPromptIdxs` + `recipeHighlightIdxs`
     to show: TLDR, numbered key prompts with copy buttons,
     decisions, collapsed diffs, struck-through dead-ends.

1.4 **One-click fork-into-tool** in the session view:
   - Buttons for Claude Code, Cursor, Codex, Hermes, Windsurf.
   - Each generates a deep link OR copies a CLI command:
     - Claude Code: `claude --prompt "$(curl <fork-url>)"`
     - Cursor: `cursor://anysphere.cursor-deeplink/prompt?text=<url-enc>`
     - Codex: `codex --resume <fork-url>`
     - Hermes: `hermes resume <fork-url>`
     - Windsurf: similar deep-link if available, else copy-prompt
   - Reuse the existing `/u/[user]/[slug]/fork` markdown endpoint.

1.5 **`trail open <url>` CLI subcommand**:
   - Detects installed tools by probing `$PATH`.
   - Pulls the recipe markdown from the fork endpoint.
   - Pipes / launches the most-recently-used tool, or asks if multiple.
   - Adds `--tool=<name>` override.

1.6 **Comments + "this worked" reactions**:
   - New table `session_reaction (id, session_id, user_id, kind,
     note, created_at)` with `kind in ('worked','needs-tweak','broken')`.
   - Server actions; optimistic UI; rate-limit by user.
   - Auto-verify: when a user uploads a new session whose first
     prompt matches the parent recipe's setup prompt, mark
     `kind='worked-verified'` automatically.

1.7 **Curated playlists** — new table `playlist (id, slug, title,
   description, owner_id, created_at)` + `playlist_session
   (playlist_id, session_id, position)`. Surface at `/p/[slug]`.

### Files likely to change

- `apps/web/db/schema.ts` (new columns + tables + migrations)
- `apps/web/lib/openai.ts` (extend structured output)
- `apps/web/app/api/sessions/upload/route.ts`
- `apps/web/app/learn/page.tsx` (new)
- `apps/web/app/u/[user]/[slug]/page.tsx` (refactor)
- `apps/web/components/recipe-view.tsx` (new)
- `apps/web/components/fork-buttons.tsx` (new)
- `apps/cli/src/commands/open.ts` (new)
- `apps/cli/src/index.ts` (wire command)
- `apps/web/app/p/[slug]/page.tsx` (new)
- Backfill scripts under `apps/web/scripts/`

### Phase 1 exit criteria

- `/learn?tool=claude-code&framework=nextjs&task_type=onboarding`
  returns at least 5 real, shipped trails (after backfill).
- Clicking "Open in Claude Code" on a recipe launches the tool with
  the setup prompt prefilled (verified on local install).
- `trail open https://gettrail.../u/x/y` works on macOS.

---

## Phase 2 — Portfolio (the Job B surface)

### Goals
1. The profile page is something a recruiter screenshots and pastes.
2. Receipts: every session links to the PR/commit it produced.

### Concrete tasks

2.1 **GitHub PR/commit linkage**:
   - On upload, if `repo` is present and `account.providerId='github'`
     has an access token, query GitHub for PRs touching the
     `distinctFiles` list within `startedAt … endedAt + 24h`. Store
     first match in `trail_session.shipped_pr` (text), `shipped_at`
     (timestamp).
   - Render as a "shipped" pill linking to the PR.

2.2 **Skill graph card** on `/u/[user]`:
   - Aggregate from `tools_used`, `frameworks`, `languages`,
     `toolCallCounts` across all public sessions.
   - Render as horizontal bar with top-8 + "more" toggle.

2.3 **"Born on Trail" SVG badge**:
   - `/api/badges/[user].svg?repo=…&pr=…` returning a Shields.io-style
     SVG. Users paste into PR descriptions / READMEs.

2.4 **Activity heatmap + streak**:
   - GitHub-style year heatmap from `startedAt`.
   - Current streak + longest streak counters.

2.5 **Interview view** at `/u/[user]?for=interview`:
   - Shipped-only sessions.
   - Skill graph at top.
   - Hides comments, reactions, and ephemera.
   - Adds a one-page printable summary (Tailwind `@media print`).
   - Optional `?embed=1` for iframing in a personal site.

2.6 **Custom domains**:
   - Vercel multi-domain config: CNAME `trail.<theirdomain>` →
     `gettrail.vercel.app`, resolve to `/u/<handle>` via middleware.
   - Tied to authenticated handle.

2.7 **Endorsements**:
   - New table `endorsement (from_user_id, to_user_id, session_id,
     note, created_at)`.
   - One per (from, to, session). Render as "@a vouches for this
     trail" / "@a vouches for @b" on profile.

### Files likely to change

- `apps/web/db/schema.ts` + migrations
- `apps/web/app/api/sessions/upload/route.ts` (GitHub linkage)
- `apps/web/app/u/[user]/page.tsx` (skill graph + heatmap +
  interview branch)
- `apps/web/app/api/badges/[user]/route.ts` (new)
- `apps/web/middleware.ts` (custom domain routing)
- Components: `skill-graph.tsx`, `activity-heatmap.tsx`,
  `interview-summary.tsx`

### Phase 2 exit criteria

- `/u/jankarlo.faris` shows a shipped-PR pill on at least one session.
- `trail.janfaris.com` resolves to the profile.
- Print preview of `?for=interview` is one A4 page.

---

## Phase 3 — Growth

### Goals
Build distribution loops that don't depend on Trail being already-popular.

### Concrete tasks

3.1 **oEmbed** — `apps/web/app/api/oembed/route.ts` returning the JSON
   spec for any session URL. Registered as a provider so dev.to / Notion
   / GitHub render Trail links as cards.

3.2 **Embed iframe** — `/u/[user]/[slug]/embed` renders the recipe view
   stripped of chrome, with fork buttons inside.

3.3 **Weekly digest** — cron at `apps/web/app/api/cron/digest/route.ts`:
   ranks top-N trails by reactions + forks + views in the last 7d,
   per tool. Email via Resend or SES. Subscribers stored in a new
   `digest_subscriber` table.

3.4 **Leaderboards** — `/leaderboard` showing top trails / top users
   per tool per month.

3.5 **RSS** — `/u/[user]/feed.xml`, `/learn/feed.xml`,
   `/discover/feed.xml`.

3.6 **Public API v1** — `/api/v1/trails`, `/api/v1/users/[handle]`,
   pagination, JSON. Docs at `/docs/api`.

3.7 **Cross-post toggle** — when owner clicks "share to X / Bsky" we
   POST to their connected account with the OG card.

3.8 **Achievements** — `achievements` table; awarded on cron tick.
   First MCP trail, first 100 prompts, first cross-user fork, etc.

### Phase 3 exit criteria

- Trail URLs render as native cards on dev.to.
- Weekly digest opt-in works end-to-end with one real subscriber.
- Public API returns JSON for at least 3 endpoints with documented
  pagination.

---

## Risks / open questions

- **LLM cost creep.** The tag-extraction call adds ~$0.0002 per
  upload. Tolerable at any reasonable scale; revisit if upload
  volume goes 10×.
- **GitHub rate limits.** PR linkage uses each user's OAuth token,
  so it's bounded per-user. Should be fine.
- **Deep-link fragility.** Cursor / Claude Code deep-link schemas
  may change. Mitigate by always shipping the markdown-copy
  fallback alongside any deep-link button.
- **Anonymizer false positives.** Aggressive detectors may scrub
  example values in tutorials. Mitigate with the preview-before-
  publish UX and `--allow-suspects` escape hatch.
- **Visibility of pending-review sessions.** Need a "review queue"
  UI for the owner so flagged sessions don't get stuck invisible.
  Build this as part of Phase 0 even though it's a small piece.

---

## Execution order

Strictly serial across phases (Phase 0 gates everything else).
Within each phase, the numbered tasks can be parallelized after
the schema migration lands.

Start: Phase 0, task 0.1 (named-provider detectors).
