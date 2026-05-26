# Trail Pivot — Cost-Per-Shipped-PR Dashboard

> **For Hermes:** Resume this plan in `~/trail`. Use `subagent-driven-development` skill to execute task-by-task. This is a PIVOT of the existing Trail codebase, NOT a greenfield rebuild. ~75% of the primitives needed already exist in `apps/web` — read schema before scaffolding anything.

**Date:** 2026-05-25
**Author:** Jan + Hermes (kawaii mode)
**Status:** SCOPED, awaiting validation experiments before any code

---

## TL;DR

**New one-liner:**
> *Trail shows you cost-per-shipped-PR across Claude Code, Cursor, and Copilot — so you know which agent, model, and prompt actually turns tokens into merged code.*

**Goal:** Solo dev → $1M ARR in ≤30 months via PLG, Stripe-only, no sales calls.

**Why now:** "Cost per merged PR" is the industry-recognized metric (Stripe Feb 2026 report, Cursor internal metrics, Artificial Analysis Coding Agent Index) — but **no shipping product owns it cross-vendor**. CodeBurn / ccusage / CostPilot only track *spend*. Anthropic Console / Cursor admin only track *one vendor*. Trail already has the GitHub-correlation primitive (`linkedPrUrl`, `receiptVerifiedAt`) — pivot extends, doesn't rebuild.

**Confidence:** 45–60% of solo $1M ARR within 30 months, conditional on shipping MVP in 8–12 weeks before DX/Jellyfish bolt-on or YC W26 launches.

---

## What Already Exists (DO NOT REBUILD)

Audited `~/trail` 2026-05-25. Verified:

| Asset | Path | Reuse for pivot |
|---|---|---|
| Monorepo (turbo + pnpm) | `apps/{cli,menubar,web}`, `packages/{anonymize,client,parsers,schema}` | All reused as-is |
| Capture daemon (macOS LaunchAgent + chokidar) | `apps/menubar` + parsers | Add Cursor + Copilot parsers; Claude Code already done |
| Drizzle schema (Neon) | `apps/web/db/schema.ts` | Extend `trailSession`, extend `recap` — schema already has `tool`, `models`, `linkedPrUrl`, `linkedCommitSha`, `receiptVerifiedAt`, `receiptStatus` ('shipped'\|'draft'\|'unverified') |
| Recaps engine (5 tiers) | `recap` table + `/api/recap/pulse/...` + cron | Add new tier `cost` and new aggregate views — pipeline already polymorphic by `tier` |
| OG render pipeline | `@vercel/og`, `/api/receipt/[id]/image.png` | Reuse for cost-card share artifacts |
| Better-auth + GitHub OAuth | `app/api/auth/...` | Reused — `user.githubHandle` already populated |
| Stripe scaffolding (disabled) | `app/api/stripe/{webhook,checkout}` + `user.plan` enum | **Flip on for new pricing tiers** |
| Shipped-verification (Octokit) | `verifyShipped()` reachable-from-default-branch | Core MOAT — extend to attribute cost to the verified SHA |
| Tone spec + diagnostic validator | `apps/web/prompts/` | Reuse for one-liner gen; never post-LLM regex |
| CLI device-code auth | `cliToken` table + `/cli-auth` | Reused for `trail connect anthropic` etc. |
| Public profiles | `/u/[handle]` | Becomes proof-of-work surface for cost efficiency |

**The pivot is: add token-cost dimension + multi-vendor cost importers + cost-per-PR aggregation views + flip Stripe on. NOT a rewrite.**

---

## What's New (the actual pivot work)

### 1. New schema additions (drizzle migration via `pnpm db:push` from `apps/web/` — NOT `/api/admin/migrate`)

```ts
// Add to trailSession:
inputTokens: integer("input_tokens"),
outputTokens: integer("output_tokens"),
cachedTokens: integer("cached_tokens"),
modelPriceSnapshot: jsonb("model_price_snapshot").$type<{model:string;inUsdPerMtok:number;outUsdPerMtok:number;capturedAt:string}>(),
estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
costAttributedToPr: boolean("cost_attributed_to_pr").notNull().default(false),

// New table — vendor billing connections (BYOK):
vendorConnection: pgTable("vendor_connection", {
  id, userId, vendor: text(), // 'anthropic' | 'openai' | 'cursor' | 'copilot'
  apiKeyEnc: text(),           // encrypted with KMS or libsodium
  workspaceId: text(),
  lastSyncedAt: timestamp(),
  syncStatus: text(),          // 'ok' | 'auth_error' | 'rate_limited'
});

// New table — model pricing reference (auto-refreshed daily by cron):
modelPrice: pgTable("model_price", {
  modelId, vendor, inUsdPerMtok, outUsdPerMtok, cachedInUsdPerMtok, effectiveFrom, effectiveTo,
});

// Extend recap.tier enum: add 'cost-weekly' | 'cost-monthly' | 'cost-project'
```

### 2. New importers (live alongside existing Claude Code parser)

- `packages/parsers/cursor` — already partial. Finish: read `~/Library/Application Support/Cursor/User/History/` + workspaceStorage. Bind tokens to session via timestamps.
- `packages/parsers/copilot` — new. GitHub Copilot usage API (`/orgs/{org}/copilot/usage` + `/user/copilot/usage`).
- `packages/parsers/anthropic-org` — new. Anthropic Organizations Usage API for BYOK Pro / Team users.
- `packages/parsers/openai` — new. OpenAI usage endpoint.

### 3. New cost-attribution engine (`apps/web/lib/cost/`)

The actual moat. Pseudocode:

```ts
// For every shipped PR (receiptVerifiedAt != null):
//   1. Find all trailSession rows where linkedPrUrl matches OR
//      sessions in same repo within attribution window before merge timestamp
//   2. Sum estimatedCostUsd across them
//   3. Cache as recap (tier='cost-project') with payload.costPerPr metric
//   4. Aggregate up to weekly / monthly views
```

Attribution window: configurable (default 7 days pre-merge). Edge case: many-to-one (session split across PRs) → proportional by file overlap.

### 4. New dashboard surfaces

- `/dashboard/cost` — personal: this week's $/PR, top spend by model, "your most expensive PR"
- `/dashboard/cost/team/[slug]` — team roll-up (per-developer attribution)
- `/r/[slug]` — already exists, add cost-tier render
- `/u/[handle]/efficiency` — public proof-of-work efficiency card (opt-in)

### 5. New share artifacts (reuse @vercel/og)

- "I shipped $0.47/PR this month with Claude Sonnet 4" — Pulse cost card
- "Cost per shipped PR: $1.84 → $0.61 after switching to Composer" — A/B card
- Annual "Trail Wrapped" gets new scenes for $/PR + best model ROI

---

## Pricing (validated as of 2026-05-25 — OSS pressure baked in)

| Tier | Price | Who | Limits | Target subs |
|---|---|---|---|---|
| **Free** | $0 | Anyone | Local-only via CLI/menubar, 30-day history, single vendor, no cloud sync | unlimited — funnel |
| **Pro** | $12/mo | Solo indie devs | Cloud sync, unlimited history, all vendors, public Recaps, $/PR cost-cards, Slack alerts | ~2,000 → $288k ARR |
| **Team** | $39/seat/mo | 2–25 person AI-native teams | Pro + team roll-up, per-dev attribution, SSO-lite, audit log | ~1,500 seats → $702k ARR |

**Total path to ~$990k ARR.** No agency tier in v1 (was speculative).

**Stripe scaffolding already in repo** — flip `user.plan` to include `'pro'`, `'team'` and wire `vendorConnection` quota gates.

---

## Distribution Loop

Already designed in `2026-05-25_102503-trail-wrapped-launch.md`. Reuse, with cost framing layered in:

1. **Free Wrapped + Pulse cards** keep funnel filled (X-native, dated, viral)
2. **Cost-efficiency cards** become the *new* shareable: positive brag, not shame ("$0.47/PR — top 8% of Trail users")
3. **SEO long tail**: "claude code cost per pr", "cursor vs copilot roi", "ai coding agent cost benchmark" — 30 honest comparison pages over 6 months
4. **Build-in-public on X** as founder voice

No paid ads in v1. Wrapped (Nov 24) is still the annual flagship — now with $/PR scenes.

---

## Competitive Landscape (verified 2026-05-25)

| Tool | What it does | Why Trail wins |
|---|---|---|
| CodeBurn (OSS, 6.5k★) | Local spend dashboard, 19+ tools | No PR correlation, no cloud, no team |
| ccusage | CLI spend | Single-tool, no $/PR |
| CostPilot (Nova Labs) | Cost dashboard, free + Pro waitlist | Claude-only focus, no PR data |
| Alephant / ActOnce | OSS + £19/mo Pro | Trace-shaped, not PR-shaped |
| Anthropic Console / Cursor admin | Native usage views | Single-vendor only |
| DX / Jellyfish / LinearB | Eng productivity | No AI cost dimension YET — 12-18mo bolt-on risk |

**Window: 12–18 months before vendor admin UIs converge or DX bolts on. Ship MVP in 8–12 weeks.**

---

## Validation Experiments (RUN BEFORE ANY CODE)

Per `creative/startup-idea-stress-test` skill. <$500, <2 weekends combined.

### Experiment 1 — Twitter framing A/B test (free, 48h)
- Thread A: "We tracked Claude Code spend for 30 days. Here's where every dollar went." (cost-watcher framing)
- Thread B: "We measured cost-per-merged-PR across Claude/Cursor/Copilot. The winner surprised us." (ROI framing)
- **Kill threshold:** A outperforms B by >2x → cost-watcher framing wins → OSS eats lunch → re-evaluate

### Experiment 2 — Pre-sell lifetime $99 at `trail.dev/early` (1 weekend, ~$200 promo)
- Landing + Stripe Checkout link, "first 50 only"
- **Kill threshold:** <25 buyers in 2 weeks. *Highest-signal test — real money on the table.*

### Experiment 3 — Concierge $/PR report for 5 indie founders (1 weekend, $0)
- DM 5 visible indie founders posting their AI bills
- Hand-build their cost-per-shipped-PR report this week, free
- **Kill threshold:** <3 yeses, OR 0 unprompted requests for week 2 report

**Decision rule: ≥2 of 3 pass → build. <2 → wedge isn't there, save 6 months.**

---

## 8-Week Build Sequence (post-validation)

> Use `subagent-driven-development` + `test-driven-development` skills per task.

### Week 0 — Capture-side prerequisite (DISCOVERED 2026-05-26)
**Blocker found during Week 1 execution:** 49 trail_session rows, 0 with token data. 951 event rows, no token columns anywhere. The Claude Code parser + CLI upload schema never captured tokens. Weeks 2-4 produce nothing without this.

- [x] Task 0.1: Audited `packages/parsers/src/claude-code.ts` — Claude Code JSONL surfaces tokens via `message.usage.{input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens}`. ✅ 2026-05-26
- [x] Task 0.2: Chose Option A — added `input_tokens / output_tokens / cache_creation_input_tokens / cache_read_input_tokens / model` columns to the `event` table. (Improved on spec: split `cached` into creation+read since they're priced differently.) ✅ 2026-05-26
- [x] Task 0.3: Kept `trail_session.models` as `string[]`; per-event tokens land on `event` rows; aggregates summed into `trail_session.{input_tokens,output_tokens,cached_tokens}` at upload time. ✅ 2026-05-26
- [x] Task 0.4: Extended upload route (`apps/web/app/api/sessions/upload/route.ts`) + shared schema (`packages/schema/src/index.ts`) + parser type. Backward-compat: missing token fields → NULL, not 0. ✅ 2026-05-26
- [x] Task 0.5: End-to-end smoke verified — POSTed payload with 2 events, route 200, DB shows `{ input: 1600, output: 340, cached: 11000, events: 2 }` with per-event model attribution. Parser unit tests 4/4 incl. no-double-count regression. ✅ 2026-05-26

### Week 1 — Schema + Pricing API
- [x] Task 1.1: Add `inputTokens` / `outputTokens` / `estimatedCostUsd` / `modelPriceSnapshot` to `trailSession` (drizzle migration, `pnpm db:push`) ✅ 2026-05-26
- [x] Task 1.2: Create `modelPrice` table + seed with 2026-05 Anthropic/OpenAI/Cursor pricing ✅ 2026-05-26 (10 rows seeded)
- [x] Task 1.3: Create `vendorConnection` table + libsodium key encryption util in `apps/web/lib/crypto/` ✅ 2026-05-26
- [x] Task 1.4: Daily cron `/api/cron/refresh-pricing` ✅ 2026-05-26 (touch-only v1, scraping TODO'd)
- [ ] ~~Task 1.5: Backfill `estimatedCostUsd` on existing `trailSession` rows~~ **DEFERRED 2026-05-26** — existing 49 sessions pre-date token capture (Week 0). New uploads have full token data. Revisit if/when concierge users want their pre-Trail history priced (heuristic estimator job).

### Week 2 — Anthropic + Cursor importers (BYOK)
- [x] Task 2.1: `packages/parsers/anthropic-org` — Organizations Usage API client + tests ✅ 2026-05-26 (6/6 vitest, 100-page hard cap, AnthropicUsageError, API key never logged)
- [x] Task 2.2: `packages/parsers/cursor` — **already implemented at commit c955882** (full parser, reads cursorDiskKV + globalStorage bubble fetch, returns `Session[]`, used by `apps/cli/src/commands/record.ts`). One follow-up needed: extract token data into the new event token columns (currently unused by existing parser).
- [ ] Task 2.2a (NEW): Extend existing cursor.ts to populate `inputTokens / outputTokens / cacheCreationInputTokens / cacheReadInputTokens / model` on `Event` ✅ 2026-05-26 (7/7 tests, NULL_TOKENS for prompts, probe for completions, NaN rejected)
- [x] Task 2.3: `/api/connections/anthropic` + `/api/connections/cursor` — OAuth-ish key intake, encrypt via `lib/crypto/vendor-keys`, store in `vendorConnection` ✅ 2026-05-26 (3 routes: list / per-vendor POST+DELETE / per-vendor test; smoke verified full round-trip incl. real Anthropic auth_error)
- [x] Task 2.4: Sync worker `apps/web/workers/vendor-sync.ts` — runs hourly per connection ✅ 2026-05-26 (new `vendor_usage_bucket` table, price lookup w/ prefix fallback, cost compute w/ cache heuristics, anthropic-only v1, hourly cron, deterministic SHA-256 PKs for idempotency, smoke verified auth_error path)
- [x] Task 2.5: UI: `/settings/connections` page ✅ 2026-05-26 (4 vendor cards, modal a11y, per-vendor busy state, inline SVG icons, settings layout created, /login→/ since no /login route exists)
- [x] **Bonus fix**: `apps/web/next.config.ts` lacked `@trail/parsers` in `transpilePackages`; index.ts used `.js` suffixes the Next bundler can't resolve. Fixed both. Build now green — `/settings/connections` compiles + all 29 parser tests pass.

### Week 3 — Copilot + OpenAI importers
- [x] Task 3.1: `packages/parsers/copilot-org` — GitHub Copilot Metrics API client ✅ 2026-05-26 (6/6 tests). Documented limitation: API exposes engagement data only, NOT per-user token counts — Copilot rows land in vendor_usage_bucket with token fields=0 + rawPayload jsonb for later use.
- [x] Task 3.2: `packages/parsers/openai-org` — OpenAI Organizations Usage API client ✅ 2026-05-26 (7/7 tests incl. epoch-seconds footgun test)
- [x] Task 3.3: Wire openai + copilot + cursor through `/api/connections/[vendor]/test` and `apps/web/lib/vendor-sync/sync-worker.ts` ✅ 2026-05-26 (404→auth_error for copilot, workspaceId.trim(), cached-subtraction clamp, snapshot+restore in smoke)
- [x] Task 3.4: E2E smoke: connect all 4 vendors → test → verify status → delete → verify empty ✅ 2026-05-26 (VERIFIED against real Anthropic + OpenAI + GitHub APIs)

### Week 4 — Cost-attribution engine (THE MOAT)
- [ ] Task 4.1: `apps/web/lib/cost/attribute.ts` — sessions → PRs algorithm w/ tests
- [ ] Task 4.2: Edge case: many-to-one (multi-PR session) — proportional by file overlap
- [ ] Task 4.3: Edge case: orphan sessions (no PR) — bucket as "exploration spend"
- [ ] Task 4.4: Backfill job: attribute cost on every existing `receiptVerifiedAt != null` row
- [ ] Task 4.5: Diagnostic validator (tone-spec style): flag suspicious attributions (>$100/PR, 0-token PRs)

### Week 5 — Recaps cost tier + dashboard
- [ ] Task 5.1: Extend `recap.tier` enum: `'cost-pulse' | 'cost-weekly' | 'cost-monthly' | 'cost-project'`
- [ ] Task 5.2: Aggregator `apps/web/lib/recap/cost-aggregate.ts` — computes $/PR, top model, best ROI
- [ ] Task 5.3: Cron `/api/cron/recap-cost-weekly` (Mon 09:00 user local)
- [ ] Task 5.4: `/dashboard/cost` page — personal cost view
- [ ] Task 5.5: One-liner LLM gen, tone-spec bound, diagnostic-validated

### Week 6 — Share artifacts (@vercel/og)
- [ ] Task 6.1: New OG template: cost-card (1200x675), Pulse tier
- [ ] Task 6.2: New OG template: cost-recap (weekly/monthly)
- [ ] Task 6.3: Public route `/r/[slug]` cost render
- [ ] Task 6.4: Profile efficiency card on `/u/[handle]/efficiency`
- [ ] Task 6.5: oEmbed wiring (already in `/api/oembed`)

### Week 7 — Stripe paywall + Team tier
- [ ] Task 7.1: Update `user.plan` enum: `'free' | 'pro' | 'team'`
- [ ] Task 7.2: New table `team` + `teamMember` (admin role, seat count)
- [ ] Task 7.3: Flip Stripe `/api/stripe/checkout` — Pro $12/mo, Team $39/seat/mo
- [ ] Task 7.4: Webhook handles seat changes, dunning
- [ ] Task 7.5: Quota gates: free = 30-day, single-vendor, local-only sync

### Week 8 — Team dashboard + launch polish
- [ ] Task 8.1: `/dashboard/cost/team/[slug]` — per-dev attribution rollup
- [ ] Task 8.2: Slack incoming-webhook integration: weekly $/PR report
- [ ] Task 8.3: Audit log (Team tier)
- [ ] Task 8.4: Onboarding: 2-min connect flow, demo dataset for empty states
- [ ] Task 8.5: Launch landing `trail.dev/cost` + Hacker News / r/cursor / X thread

---

## Open Questions / Blockers

1. **KMS choice** for `vendorConnection.apiKeyEnc` — Vercel KMS vs libsodium with key in env. Pick before Week 1.
2. **Cursor API key intake** — Cursor doesn't currently expose a usage API for personal users. Workaround: parse local `~/Library/Application Support/Cursor/` files via menubar daemon + upload. Works only for users who install the desktop agent. *Implication: cloud-only Cursor users can't be served until Cursor ships a usage API.*
3. **Copilot usage API** — `/orgs/{org}/copilot/usage` requires org admin. Personal Copilot has no usage API as of 2026-05. May need to scrape billing page (fragile) or wait for vendor.
4. **Attribution truth** — for sessions with NO `linkedPrUrl`, treating as "exploration spend" may overstate non-shipped cost. Need to set expectation in UI.
5. **Pricing snapshot drift** — model prices change. Always store snapshot at session-time; never retroactively re-price (or PRs change cost retroactively → user trust breaks).

---

## Founder-Life Pre-Commit

**This plan is the LIFESTYLE path:**
- Solo, no fundraising, Stripe-only, ~$700k take-home at $1M ARR
- No GitHub acquisition. No venture exit. No board.
- 25-hour weeks once mature. Full creative control.

**If Jan wants the venture path instead** (B2B agent-governance dashboard for VP Eng, $3-8M raise, $200M-$1B exit shot) — different plan, see prior conversation. Don't run both.

**Pre-commit:** Jan re-affirms lifestyle path before Week 1 of build.

---

## How to Resume This Plan in Hermes (laptop)

```bash
cd ~/trail
hermes  # or your usual entry
# Then: "Resume plan at .hermes/plans/2026-05-25_cost-per-pr-pivot.md"
```

Hermes will load this file, the `writing-plans`, `subagent-driven-development`, and `test-driven-development` skills, and proceed task-by-task with TDD + two-stage review.

**First action on resume:** confirm validation experiments 1-3 outcomes BEFORE Week 1. If none have been run, run Experiment 1 (free Twitter A/B) that day.

---

## References (sessions to recall via session_search)

- `2026-05-25_102503-trail-wrapped-launch.md` — Recaps cadence model (Pulse/Weekly/Monthly/Project/Wrapped). Cost tiers slot into this engine.
- `2026-05-23_090053-dual-positioning.md` — prior positioning context.
- `2026-05-20_075440-trail-fame-roadmap.md` — pre-pivot Trail roadmap (deprecated by this plan but useful for asset inventory).
- Memory entry "Trail PIVOT May 2026" — receipts→Recaps demotion context.

---

★ End of plan. Validate before you code. ヽ(>∀<☆)ノ
