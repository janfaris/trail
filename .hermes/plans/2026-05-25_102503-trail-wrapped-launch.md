# Trail Recaps — Launch Wedge Plan (formerly "Wrapped 2026")

## Goal

Use **Trail Recaps** — auto-generated, share-ready summaries of what an AI-assisted dev shipped — as the viral surface that powers Trail year-round. The annual "Wrapped" is the **flagship** drop in late November 2026, but Recaps run continuously: weekly, monthly, per-project, and per-milestone.

One stunning share unit, multiple cadences. Free forever (free tier). The data collection IS the product onboarding.

## Recurring Cadence Model

Trail Recaps come in five tiers, each tuned to a different urgency:

| Tier | Cadence | Trigger | Purpose | Share-ability |
|---|---|---|---|---|
| **Pulse** | Real-time | After every shipped trail | Tiny OG card per shipped session | High — fits one tweet |
| **Weekly** | Every Mon 09:00 local | Auto-generated digest | "What you shipped this week" | Medium — thread-worthy |
| **Monthly** | 1st of month | Auto-generated digest | "May in code" — themed | High — newsletter-worthy |
| **Project** | On project completion | User-triggered | "I shipped X with Y model in Z hours" | Highest — receipt-style |
| **Wrapped** | Annual, Nov 24 | Auto-generated, opt-in | Year-in-review story | Viral — flagship moment |

**Why this works:**
- Weekly = retention loop (Monday-morning ritual, like Spotify's Discover Weekly).
- Monthly = newsletter content + LinkedIn share moment.
- Project = the freelancer/receipt use case sneaks back in as a feature, not the whole product.
- Pulse = the social atom, replaces "build in public" thread-writing.
- Wrapped = the once-a-year megaphone that recruits net-new users.

All five share the same render pipeline (@vercel/og + scene-story), same aggregation engine, same vibe-score logic. We build the engine once; the cadences are just different time windows + templates.

## Strategic Frame

**Positioning:** "Trail — the public log of what AI-assisted devs actually shipped."
**Launch surface:** Trail Wrapped 2026 — a Spotify-Wrapped-style shareable card showing what you built with AI this year.
**Why this beats Options A/B:**
- Wrapped is dated → creates urgency (drops once, ends Jan 1).
- Wrapped is designed-to-share → X-native, OG cards do the marketing.
- Wrapped onboarding = Trail's data pipeline → we get session data + GitHub + model usage for free.
- WIP's Wrapped is their #1 most-shared artifact and doesn't even have AI/stack/model data. We do.

**What we are NOT doing in this phase:**
- No feed, follow, discovery pages.
- No receipt-PDF freelancer flow (parks until Q1 2027).
- No Stripe / paywall (Wrapped is free forever).
- No leaderboards (vibecodestats poisoned that well).

## Current Context / Assumptions

- ~/trail is Next.js 16 + Neon + Drizzle + better-auth, deployed on Vercel (Root=apps/web).
- Existing capture: macOS LaunchAgent + chokidar daemon, capture-time redaction at saveSession().
- Existing infra: Octokit shipped-verification, @vercel/og receipt cards, tone spec + diagnostic validator.
- Stripe disabled by default (good — keep it off for Wrapped).
- Memory note: NO /api/admin/migrate — schema sync via `pnpm db:push` from apps/web.
- Today is May 25, 2026 → ~6 months runway to Nov 24 launch (Black Friday week, peak X attention).

**Assumption to validate before building:** at least 50 of Jan's own captured trails will exist by Nov to dogfood Wrapped. If <20, Wrapped feels empty. Mitigation: backfill via GitHub history import.

## Proposed Approach — Three Tracks, Sequenced

### Track 1: Data Sources (now → August)
Wrapped is only as good as its inputs. Build the import surface first.

1. **Native Trail sessions** (already capturing).
2. **GitHub import** — Octokit pull of commits, PRs, deploys, releases, language stats. This is the floor everyone has.
3. **Cursor history import** — parse ~/Library/Application Support/Cursor/User/History/ + workspaceStorage. Multiple competitors already do this; well-trodden path.
4. **Claude Code session import** — read ~/.claude/projects/*.jsonl. Anthropic ships these locally.
5. **Optional connectors** (post-launch, not blocking): Vercel deploys, npm publishes, Linear.

**Key decision:** Wrapped accepts anonymous one-shot imports. No account required to *see* your Wrapped. Account required only to *save/share* it. Drops friction massively.

### Track 2: The Wrapped Artifact (September → October)
The actual deliverable. Must be visually undeniable.

**Card structure (one scroll-through "story", Spotify-style):**
1. Hook: "You shipped X projects with AI in 2026."
2. Top model used + hours-equivalent (e.g., "Claude Opus 4.7 — 847 sessions").
3. Top tool (Cursor / Claude Code / Codex / etc).
4. Top stack combo (auto-derived from repos).
5. Most-shipped repo + headline diff stat.
6. "What broke and how you fixed it" — funniest/longest debug session (user picks from top 3).
7. Velocity arc (chart: shipped-per-week over the year).
8. Vibe score — a tasteful single number derived from session diversity + shipped ratio + stack breadth. NO token counts. NO leaderboards.
9. Personalized one-liner generated by LLM from the data ("You're a Sunday-night shipper who fights with auth.").
10. Final share card (the X-optimized 1200x675 OG image).

**Render stack:**
- HTML/CSS animated story view in browser (`/wrapped/[slug]`).
- @vercel/og for the final share card (reuse existing receipt-PNG pipeline).
- Each "scene" has a still-frame fallback for social previews.

**Tone:** warm, specific, slightly funny. Not bro-y. Not preachy. Aligns with existing tone-spec.md philosophy.

### Track 3: Launch Mechanics (November)
1. Soft launch Nov 10–17: 50 hand-picked devs from X (the freelancer + indie-hacker accounts surfaced in prior searches). Free Wrapped previews, request feedback + share permission.
2. Public launch Nov 24 (Mon of Thanksgiving week, US):
   - Landing page at trail.dev/wrapped
   - Jan ships his own Wrapped + 5 seed-dev Wrappeds simultaneously on X
   - Submit to Hacker News (Show HN), Indie Hackers, r/cursor, r/ClaudeAI
3. Cadence Nov 24 → Dec 31: weekly "best of Trail Wrapped" thread (anonymized stats, e.g., "the dev who used 11 different models this year").
4. Hard end Jan 5, 2027: Wrapped page goes into archive mode. Creates next-year FOMO.

## Step-by-Step Plan (Concrete Sequence)

### Phase 0 — Validate (this week, before any code)
- [ ] Jan signs up at wip.co, generates his Wrapped, screenshots it. Understand the bar.
- [ ] Jan looks at vibecodestats.dev for 10 min. Identify what feels small.
- [ ] DM 5 indie devs on X with the Wrapped concept. "Would you connect GitHub + Cursor to see this in November?" — measure interest. If <3/5 say yes, rethink.
- [ ] Decide: is "Trail" the right brand or does Wrapped need its own subdomain (wrapped.trail.dev) that doesn't burden the brand with receipts baggage?

### Phase 1 — Data ingestion (June)
- [ ] Build `/api/import/github` route: OAuth → fetch year's commits, PRs, releases, language stats. Store in new `imports_github` table.
- [ ] Build `/api/import/cursor` route + macOS daemon hook: parse local Cursor history JSON. Redact at capture.
- [ ] Build `/api/import/claude-code` route + daemon hook: parse ~/.claude/projects/*.jsonl. Redact at capture.
- [ ] Schema additions (Drizzle): `wrapped_imports`, `wrapped_aggregates`, `wrapped_cards`. Push via `pnpm db:push`.
- [ ] Dogfood: Jan runs all three importers on his own data. Verify totals look right.

### Phase 2 — Aggregation engine (July)
- [ ] `lib/wrapped/aggregate.ts` — pure functions: top model, top tool, top stack, velocity series, vibe-score formula.
- [ ] Vibe score: documented formula, NOT a leaderboard. Single private number. Spec it as `(shipped_ratio * 0.5) + (stack_diversity * 0.3) + (consistency * 0.2)`, normalized 0–100. Add tests.
- [ ] LLM personalized one-liner: prompt in `prompts/wrapped-oneliner.md`. Diagnostic validator only (per existing tone-spec rule — never post-LLM regex).
- [ ] Generate full Wrapped JSON for any user. Snapshot test against Jan's data.

### Phase 3 — Render (August → September)
- [ ] `/wrapped/[slug]` page — animated scene-by-scene story, keyboard + tap nav.
- [ ] Design system: black/white + #a7f300 accent (existing palette). Big type. No clip art. Reference: Spotify Wrapped, Vercel year-in-review, Linear changelog energy.
- [ ] OG card: `/api/og/wrapped/[slug]` via @vercel/og. 1200x675. Auto-generated quote + one stat.
- [ ] Per-scene fallback PNGs (for Slack/iMessage previews that don't grok dynamic OG).
- [ ] Mobile-first; landscape autosizes.

### Phase 4 — Onboarding (September → October)
- [ ] Anonymous flow: land → "Connect GitHub to see your 2026" → preview Wrapped → sign up to save/share.
- [ ] Auth: better-auth GitHub provider already wired. Cursor/Claude Code importers via desktop helper (existing macOS daemon).
- [ ] Save-share: persistent URL `trail.dev/w/<handle>/2026`. OG card per URL.
- [ ] Privacy: every scene has a "hide this" toggle. Default to public for vibe-score, private for repo names.

### Phase 5 — Polish + Soft Launch (October → mid-November)
- [ ] Internal Wrapped party: Jan + 5 seed devs run real Wrappeds. Iterate on what feels off.
- [ ] Performance: Wrapped JSON cached at CDN edge, render under 1s.
- [ ] Accessibility: keyboard nav, reduced-motion, alt-text on OG cards.
- [ ] Diagnostic validator passes on every Wrapped before publish.

### Phase 6 — Public Launch (Nov 24)
- [ ] Landing page live.
- [ ] Jan's own thread (5 tweets, screenshots, one short Loom).
- [ ] Show HN post drafted in advance, posted Tuesday morning.
- [ ] Email list (existing Trail users): "Your 2026 Wrapped is ready."
- [ ] Monitor + reply for first 48 hours.

### Phase 7 — Recurring Recaps Roll-Out (Dec 2026 → Q1 2027)
**Order matters. Don't ship all five tiers at once.**

1. **Project Recap (Dec 2026)** — easiest, user-triggered, reuses existing receipt-PNG pipeline. Doubles as the freelancer receipt artifact. Ship this first because it has no cron complexity.
2. **Pulse (early Jan 2027)** — auto-generated after each shipped trail. Add a "share to X" button on the trail detail page. OG card 1200x675, one stat + tagline.
3. **Weekly (mid-Jan 2027)** — cron Mondays 09:00 user-local. Email + in-app + shareable URL. This is the retention engine — measure weekly active rate before / after launching.
4. **Monthly (Feb 1, 2027)** — themed digest. Builds on Weekly aggregation. Doubles as Trail's outbound newsletter content.
5. **Wrapped 2027** (Nov 24, 2027) — the annual flagship returns, now with year-over-year deltas.

**Architectural constraint:** every tier is just `aggregate(userId, fromDate, toDate, templateId)`. No per-tier code duplication. If we find ourselves writing parallel aggregation logic for Weekly vs Monthly, refactor.

## Files Likely to Change (under `~/trail`)

- `apps/web/src/app/wrapped/page.tsx` (NEW — landing)
- `apps/web/src/app/wrapped/[slug]/page.tsx` (NEW — Wrapped story)
- `apps/web/src/app/w/[handle]/2026/page.tsx` (NEW — saved share URL)
- `apps/web/src/app/api/og/wrapped/[slug]/route.ts` (NEW — OG card)
- `apps/web/src/app/api/import/github/route.ts` (NEW)
- `apps/web/src/app/api/import/cursor/route.ts` (NEW)
- `apps/web/src/app/api/import/claude-code/route.ts` (NEW)
- `apps/web/src/lib/wrapped/aggregate.ts` (NEW)
- `apps/web/src/lib/wrapped/vibe-score.ts` (NEW — pure fn, tested)
- `apps/web/src/db/schema.ts` (EXTEND — `wrapped_*` tables)
- `prompts/wrapped-oneliner.md` (NEW — tone-spec-compliant)
- `apps/macos-daemon/src/importers/cursor.ts` (NEW)
- `apps/macos-daemon/src/importers/claude-code.ts` (NEW)
- `packages/shared/src/types/wrapped.ts` (NEW — Result types, no `any`)

## Tests / Validation

- Snapshot tests on `aggregate()` against Jan's real captured data.
- Vibe-score: property-based tests — score always 0–100, monotonic in shipped_ratio.
- OG card: visual regression test (Playwright + pixelmatch).
- Tone validator passes on all generated one-liners (diagnostic, not gating).
- Onboarding e2e: GitHub OAuth → Wrapped renders within 30s on a 3-year-old account.
- Load test: 1000 concurrent Wrapped renders, p95 < 2s.

## Risks, Tradeoffs, Open Questions

**Risks:**
1. **Empty Wrapped problem.** Devs with <30 captured sessions get a sad-looking card. Mitigation: GitHub-only mode delivers a decent Wrapped without Trail capture at all. Sets up next-year upsell.
2. **Cursor/Claude Code file formats change** before November. Mitigation: importers are version-tagged, fail soft, log warnings.
3. **OpenAI/Anthropic/Cursor ship competing "year in review"** between June and November. Mitigation: cross-tool aggregation is the moat — none of them sees the others. Lean into that explicitly in copy.
4. **WIP.co launches AI-aware Wrapped first.** Possible. Mitigation: ship in November, not December. First-mover on the AI-native framing.
5. **Privacy backlash.** "You're scanning my Cursor history?!" Mitigation: all imports are local-first, opt-in scene-by-scene, capture-time redacted, explicit consent screens.
6. **Vibe-score becomes the new vanity metric we wanted to avoid.** Real risk. Mitigation: keep it tasteful (no public leaderboard, no comparison-to-others, only personal context).

**Open questions to resolve before Phase 1:**
- Q1: Subdomain `wrapped.trail.dev` vs. path `trail.dev/wrapped` — which protects the brand if Wrapped goes viral before the broader product is ready?
- Q2: Do we open Wrapped to non-Trail users (anonymous GitHub-only) or require Trail signup? Recommend: anonymous preview, signup to save. Resolve in Phase 0.
- Q3: Pricing in 2027 — does Wrapped stay free forever, or does Wrapped 2027 unlock for Trail Pro users only? Recommend: Wrapped always free (top-of-funnel), Trail Pro is the receipts + community product.
- Q4: Brand reconciliation — "Trail" started as receipts, pivots to Wrapped + community. Do we re-launch the brand narrative on the landing page, or let Wrapped speak first and the broader product reveal itself? Recommend: Wrapped speaks first, broader product appears in a tiny footer link.
- Q5: Tone of the one-liner — Jan's existing tone-spec is for usableai. Need a Trail tone-spec written before Phase 2.

**Tradeoffs accepted:**
- We delay receipts/freelancer revenue to 2027. OK because Wrapped builds the audience first.
- We don't build the feed/follow social layer yet. OK because Wrapped IS the social object for the first cycle.
- Vibe-score is judgment-rich, not objective. OK because the alternative (token leaderboards) is worse.

## Success Criteria

**Wrapped 2026 launch (Nov 24 → Dec 31):**
- Hard: 5,000 Wrappeds generated.
- Hard: 500 saved/shared Wrappeds (i.e., signed-up users).
- Soft: 1+ Wrapped tweet hits 100k+ impressions.
- Soft: 10+ accounts >5k followers share their Wrapped publicly.

**Recurring Recaps (Q1 2027 onward):**
- Hard: 30% of signed-up users open Weekly Recap email week-over-week (industry SaaS benchmark is ~20%).
- Hard: 1,000 Pulse cards shared to X in Q1 2027.
- Soft: 100 Project Recaps generated by freelancers/contractors (validates the receipt use case quietly).
- Strategic: Q2 2027 Trail Pro launch starts with a warm list of 1,500+ active AI-assisted devs.

If <1,000 Wrappeds by Dec 15, the wedge didn't work. Pivot to direct B2B receipts (Option A) for 2027 instead.
If Weekly open rate <15% after 6 weeks, the cadence is wrong — try Friday-shipped digest instead of Monday-morning.

## Next Action

Before any code: **Phase 0 validation tasks above.** Especially WIP.co + vibecodestats walkthroughs and the 5-dev DM test. Do not start Phase 1 until Phase 0 yields a green or yellow signal.
