# Trail: Dual-Positioning Reframe — Portfolio + Playbook

## Goal

Reposition Trail from "AI coding portfolio for recruiters" (single-flywheel) to **"Show how you build with AI. Learn how others do."** (dual-flywheel: portfolio + learn). Execute as (1) homepage rewrite and (2) `/learn` surface upgrade.

## Strategic frame

- **Wedge:** Strava for AI-assisted building. Real session traces, not curated tutorials.
- **Two audiences, one substrate:**
  - Builders publish trails → portfolio (recruiter-facing).
  - Learners read trails → taste/technique (SEO + word of mouth).
- **Network effect:** every shipped trail is BOTH portfolio AND lesson. Defensible because it requires the recording substrate.
- **Risk to avoid:** don't drift into "tutorial platform." Stay on the "raw evidence + light curation" side.

## Current context

- `apps/web/app/page.tsx` — current landing, 576 lines. Hero positions Trail as portfolio for recruiters. Strong design craft, weak prose in builder note + closing line + symmetric FAQ.
- `apps/web/app/learn/page.tsx` — already exists (350 lines). Need to audit + upgrade, not greenfield.
- `apps/web/app/discover/page.tsx` — public feed of trails. Adjacent surface.
- Palette locked: #09090b / #fafafa / #a7f300. Geist + Fraunces. Don't touch.
- Stack: Next.js 16 (read `node_modules/next/dist/docs/` before any new API usage), Neon, Drizzle, better-auth, pgvector, Azure Foundry.

## Proposed approach

Ship in two PRs, sequenced. PR1 = homepage reframe (biggest narrative lift, no new schema). PR2 = /learn upgrade (depends on having curated picks + possibly a light `featured` flag on trails).

---

## PR1 — Homepage reframe

### Narrative arc (top→bottom)

1. **Hero** — tagline shift. Candidates:
   - "Show how you build with AI. Learn how others do."
   - "The portfolio AND the playbook for AI-native builders."
   - Pick #1 (parallelism, two verbs, two audiences). Sub: "Trail records your AI coding sessions. The best ones become your portfolio — and everyone else's playbook."
2. **Live profile card** — keep. Still the strongest proof unit.
3. **NEW: dual-track strip** — two columns under hero:
   - "For builders" → shipped trails = portfolio recruiters actually read.
   - "For everyone else" → real session traces from senior builders. Browse `/learn`.
   - One CTA each: "Install Trail" / "Browse the playbook."
4. **4-stage walkthrough** — keep as-is. It's the strongest section.
5. **NEW: Featured trails strip** (3 cards) — pulled from `/learn` curation. "Senior debugging with Claude Code," "Multi-agent orchestration," "RAG from scratch to ship." Each links into a real public trail.
6. **Recruiter angle, demoted** — move existing recruiter copy down, reframe as consequence: "Build in public with AI. The best trails become your portfolio — recruiters are already reading them."
7. **Builder note** — cut ~40%, replace pull quote with one line. (Carryover from prior critique.)
8. **FAQ** — add one awkward/specific question: "What if my Claude Code logs contain client NDAs?" Asymmetric answers.
9. **Closing** — kill "The rest writes itself." End on install command.
10. **Footer** — minor polish, add `/learn` link.

### Code block tinting (carryover polish)

- Redaction block → faint red wash (`bg-red-500/[0.04]`, border `red-500/10`).
- README/portfolio block → faint lime wash (`bg-[#a7f300]/[0.04]`).
- Other blocks stay neutral. Gives scroll rhythm.

### Files

- `apps/web/app/page.tsx` — primary edit.
- `apps/web/app/_components/` — extract `<DualTrackStrip />` and `<FeaturedTrailsStrip />` if section count gets unwieldy. Files <200 lines per user pref.
- `apps/web/lib/featured-trails.ts` — small server-only module returning hand-curated `{slug, user, technique_tag, blurb}[]`. Stub data initially; later read from DB flag.

### Validation

- Visual: localhost render, check both light/dark (dark is default).
- Lighthouse: don't regress LCP (hero is above the fold).
- Mobile: dual-track strip stacks; featured cards horizontal-scroll on <640px.

---

## PR2 — /learn upgrade

### Audit first

Read `apps/web/app/learn/page.tsx` (350 lines) before designing. Understand current shape, then decide patch vs. rewrite.

### Target structure for /learn

1. **Header** — "The playbook. Real AI coding sessions, lightly curated."
2. **Technique buckets** (tag-driven sections):
   - Debugging with agents
   - Multi-agent orchestration
   - RAG / retrieval patterns
   - Refactors at scale
   - Greenfield builds
   - Verification loops
3. Each bucket: 3–6 trail cards. Card = title, builder avatar, one-line takeaway, event count, save count.
4. **Weekly digest CTA** — "AI Coding Patterns, weekly. The best trails, annotated." Email capture. (Content engine = moat.)
5. **Submit a trail** — small CTA: "Your trail could be here. Make it public + tag it."

### Schema / data

Minimum to ship: hand-curated list in `apps/web/lib/featured-trails.ts` (shared with PR1). Defer DB-backed curation to PR3.

Stretch (PR3, not this plan): add `featured boolean default false`, `technique_tag text`, `editor_note text` to `trails` table. Admin-only toggle in `/dashboard`.

### Lightweight social signal (defer or stub)

- Likes/saves/forks on trails is RIGHT, but it's a feature, not a positioning move. Add a `saves` count column read-only display now (always 0 until feature ships) OR drop entirely until PR3. Recommend **drop now**, ship in dedicated PR.

### Files

- `apps/web/app/learn/page.tsx` — edit.
- `apps/web/lib/featured-trails.ts` — new (shared with PR1).
- `apps/web/app/_components/TrailCard.tsx` — likely already exists for /discover; reuse, don't fork.

### Validation

- Click every featured trail → must resolve to a real public trail (no 404s).
- Tag filtering works if implemented.
- SEO: `<title>` and OG image set per technique bucket (drives the "AI Coding Patterns" search traffic thesis).

---

## Risks / open questions

1. **Featured trails inventory** — do we have 12–18 public trails good enough to feature today? If not, PR2 ships with 3–4 buckets and 2–3 cards each, plus a visible "more coming" stub. Need to check `/discover` count and quality before finalizing PR2 scope.
2. **Weekly digest** — promising as moat but a real product surface (email capture, sender infra, editorial cadence). Plan stubs the CTA only. Don't build the pipeline this round.
3. **"Strava for AI coding" framing** — strong internally, don't put it on the marketing site verbatim (analogies date fast). Use it to guide voice, not copy.
4. **Next.js 16 quirks** — any new server component / route handler patterns: read `node_modules/next/dist/docs/` first. No assumptions from Next 14/15 muscle memory.
5. **Recruiter messaging** — demoting it is correct strategically but the current SEO/landing intent is recruiter-heavy. Monitor `/u/<h>/interview` traffic after launch; if it dips meaningfully, rebalance.

## Sequencing

- **PR1** (homepage): ~3–4 hrs. Ship first — biggest narrative shift, no schema.
- **PR2** (/learn upgrade): ~3 hrs after PR1 merges, sharing `featured-trails.ts`.
- **PR3** (deferred): DB-backed featured flag + saves/likes + weekly digest pipeline. Separate plan.

## Done criteria

- Homepage tagline communicates dual audience in 1 sentence above the fold.
- `/learn` has technique buckets with ≥10 real linkable trails total.
- Builder note ≤60% of current length.
- No "The rest writes itself" closer.
- One FAQ question is asymmetric and concrete (NDA scenario).
- Lighthouse perf: no regression vs. current main.
