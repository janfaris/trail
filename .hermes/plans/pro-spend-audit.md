# Trail Pro — Spend Audit

## TL;DR

Add a Pro feature that tells users where their LLM tokens are going and how
to spend less. Two layers:

1. **Free / signed-in:** instant SQL breakdown over `event` rows. No LLM
   call, no extra cost to Trail. Becomes a strong upsell magnet.
2. **Pro:** "AI Audit" button that feeds the top-N most expensive
   prompts + the tool_call sequences that followed into a single
   large-context LLM call. Returns concrete, prompt/skill-aware
   recommendations with $ saved estimates.

This is a feature **no competitor can build** because no one else has
Trail's per-event token capture joined to prompt text, tool_call.args, and
skill structure. Anthropic console, OpenAI dashboard, Helicone, etc. give
aggregate $ — Trail can give "this skill costs you $4.20/mo and fires in
sessions that get abandoned 70% of the time, here's the rewrite."

## Data already in place

`apps/web/db/schema.ts` `event` table (lines 174-200) already captures:
- `inputTokens`, `outputTokens`, `cacheCreationInputTokens`,
  `cacheReadInputTokens`, `model` per assistant turn.
- `kind` (prompt|completion|tool_call|file_diff|decision) and full `data`
  jsonb (prompt text, tool_call.name + args, etc.).

`trail_session` already aggregates:
- `inputTokens`, `outputTokens`, `cachedTokens`, `estimatedCostUsd`,
  `modelPriceSnapshot`, `toolCallCounts`, `models`, `outcome`,
  `failedToolCalls`, `promptCount`, `distinctFiles`, `durationSeconds`.

→ No migration needed for Layer 1. Layer 2 needs a small audit-results
cache table.

## Layer 1 — Spend Breakdown (free, instant)

Six aggregations, all pure SQL, all cheap with existing indexes
(`event_session_idx`, `trail_session_user_idx`):

1. **Tokens by event.kind** — how much of your spend is prompt vs
   tool_call dumps vs file_diff. Surprises most users.
2. **Tokens by tool_call.name** — `data->>'name'` groupby. Surfaces
   "read_file with no offset", "find . dumping the repo".
3. **Tokens by model** — are you on opus when sonnet/haiku would do.
4. **Cache hit ratio** — `sum(cacheReadInputTokens) /
   sum(inputTokens + cacheReadInputTokens)`. Huge signal; most users
   don't know if caching is even on.
5. **Cost by outcome** — `estimatedCostUsd` grouped by
   `outcome` (shipped | abandoned | rabbithole). "$28 on abandoned
   sessions this month."
6. **Top-N most expensive sessions** — sorted by `estimatedCostUsd`
   with links into the existing receipt view.

UI: new route `/u/[handle]/spend` (private, owner-only). Time window
toggle (7d / 30d / all). Single page, six cards. Pure server component.

## Layer 2 — AI Audit (Pro only)

**Trigger:** "Run AI Audit" button on /spend. Disabled for free users
with a "Pro" pill that opens the Stripe checkout.

**Input assembly:**
- Pick top-N expensive prompts in the window (N=20, configurable, but
  cap to keep one-call cost predictable).
- For each: include the prompt text + the subsequent tool_calls'
  `name` + first/last 200 chars of args/result + token counts.
- For Hermes sessions: also include the skill names parsed from
  `tool_call` args where name='skill_view' or from the persona block.
  This is the moat.
- Run `packages/anonymize` over the bundle before sending.

**Prompt:** new file `apps/web/prompts/spend-audit.md`. Returns
structured JSON: `{ findings: [{ title, severity, evidence_event_ids,
estimated_monthly_savings_usd, recommendation }], total_potential_savings }`.

**Model:** gpt-5.5 ($5/$30/$0.50 cache). Single call per audit.
Estimated max input ~80k tokens (20 prompts × 4k avg) → ~$0.40 raw,
much less with caching of the system prompt across users.

**Caching / abuse control:**
- New table `spend_audit` (id, userId, windowStart, windowEnd,
  findingsJsonb, totalSavingsUsd, generatedAt). Unique on
  (userId, windowStart, windowEnd) so the same window re-renders
  cached.
- Rate limit: 1 audit per user per 24h on Pro, plus a hard monthly cap
  (10/mo). Stored in same table by counting rows.
- Honest copy: "Re-run available in 23h. Caching keeps your audit
  cost-effective."

**Privacy:**
- Opt-in toggle on user settings: "Allow Trail to analyze my prompt
  text for spend audits." Default OFF. Audit button shows
  "Enable in settings →" until on.
- `packages/anonymize` pass before LLM call. Verify it covers prompt
  *text* not just paths/emails — likely needs a small extension.
- Clear data-handling line under the button: model used, retention
  (we store findings, not the prompt bundle).

## Pricing fit (memory)

Trail Pro is already on the roadmap (Stripe SKU pending). Spend Audit
is the right hero feature for Pro because:
- Free tier has a real, valuable thing (Layer 1) — not crippled.
- Pro has a feature with a clear $-savings ROI story. "Pro pays for
  itself if it cuts your spend 5%." Most heavy users spend >$50/mo on
  Claude/Codex, so $20 Trail Pro is trivially justified.
- Trail's hosting cost per audit is bounded (~$0.40 raw, ~$0.10
  amortized with cache) → healthy margin.

## Scope cuts (do NOT do in v1)

- No real-time alerting ("your spend spiked 3x today"). v2.
- No per-skill ROI dashboard (different page, same data). v2.
- No "auto-apply this rewrite to your prompt." v3.
- No team/org spend rollup. Solo first.

## Build order

1. **Migration 0010** — add `spend_audit` table.
2. **`apps/web/lib/spend/queries.ts`** — the six SQL aggregations,
   pure functions taking `(userId, windowStart, windowEnd)`.
3. **`/u/[handle]/spend`** page — server component, six cards, owner
   gate (compare `session.userId` to handle owner).
4. **`apps/web/prompts/spend-audit.md`** — system prompt + JSON
   schema. Iterate against 2-3 real session bundles before shipping.
5. **`apps/web/lib/spend/audit.ts`** — bundle assembly +
   anonymize + LLM call + cache write. Result type, no `any`.
6. **`/api/spend/audit` POST** — Pro gate, rate limit, dispatch.
   maxDuration=60 (one model call, no streaming for v1).
7. **Settings toggle** — `user.spendAuditOptIn boolean default false`
   in migration 0010.
8. **Wire button + render findings** on /spend.
9. **Test** with own Hermes sessions (we have plenty).

## Resolved before build (verified 2026-05-27)

- **Anonymize coverage:** `packages/anonymize` deep-walks every string
  in the session including `event.text` (prompt body) and tool_call
  args. Detectors cover all major LLM/cloud/CI/payment/comms secrets,
  cred-bearing DB URLs, ENV-style KEY=VALUE with sensitive-name
  re-check, emails, /Users home paths, internal hosts, and an entropy
  sweep for unknown high-entropy survivors. Natural-language prompt
  content is intentionally preserved (we need topic structure for
  audit). **No extension needed for v1.**
- **Hermes skill attribution:** `packages/parsers/src/hermes.ts`
  emits each `skill_view` call as `{kind:"tool_call", name:"skill_view",
  args:{name:<skill-name>}}`. Query path:
  `data->>'name'='skill_view' → data->'args'->>'name'`.
  Caveat: parser skips system messages (hermes.ts:60), so the persona's
  full skill list isn't in events — but that's correct: we attribute
  by *used* skills via skill_view calls, and the fat system prompt
  shows up correctly in the cache-hit-ratio query as fixed-cost
  context.

## Open questions

- **Pro SKU:** still pending in Stripe per memory. Coordinate launch.
- **Non-Hermes tools:** decide v1 scope. Layer 1 (the SQL breakdown)
  works for ALL tools. Layer 2 AI audit can detect anti-patterns from
  prompt+tool_call data for any tool, but the skill-ROI angle only
  fires for Hermes. Recommend: ship Layer 2 with universal findings
  + Hermes-specific bonus findings, don't gate Pro on Hermes-only
  users.

## Why this is the right Pro feature (not a feature among many)

Three properties that rarely line up:
- **Hard to copy.** Requires per-event token capture *plus* prompt/
  tool/skill structure. Trail has both; competitors don't.
- **Clear $-ROI.** User can compute payback in seconds.
- **Reinforces the core loop.** Drives more recording (more data →
  better audits) and more sharing (audits surface anti-patterns,
  fixes become public receipts).
