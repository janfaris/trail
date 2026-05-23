# Trail dual-positioning rollout

Reframe: Trail is where AI-native builders show their work AND learn from each other's. Portfolio + playbook, one product. Recruiter angle becomes a consequence, not the headline.

Internal-only framing (don't put on site): "Strava for AI-assisted building."

## PR1 — homepage reframe (apps/web/app/page.tsx)

Scope-locked edits, surgical not wholesale:

1. Tagline. Replace current hero tagline with: "Show how you build with AI. Learn how others do."
2. Sub-hero strip. Add a 2-column "For builders / For everyone else" track strip directly under the hero, before stages. Builders = portfolio that proves you ship with AI. Everyone else = real session traces to learn how senior builders steer agents.
3. Featured trails strip. Add a mid-page strip ("Recent trails worth reading") that queries the same source /discover uses, limit 6. Reuse existing trail-card component if one exists.
4. Demote recruiter framing. The current "recruiters can't read your commits" hero stays as a SECTION further down, not the lede. Reframe its heading to "The best trails become your portfolio."
5. Copy fixes carried over:
   - Cut the builder note ~40%.
   - Kill the closing "The rest writes itself" line — let the install command be the last beat.
   - Add one awkward FAQ item: "What if my Claude Code logs contain client NDAs?" with a real answer (redaction rules, private-by-default, manual review before publish).
6. Code block rhythm. Faint red tint on the redaction code block, faint lime tint on the README/output block. Use existing palette tokens, no new colors.

Do NOT touch in PR1: /learn page, DB schema, featured flag, saves/likes, email capture.

## PR2 — /learn upgrade (apps/web/app/learn/page.tsx)

1. Audit existing 350-line page first — read fully, list current sections.
2. Restructure around technique buckets:
   - Debugging with agents
   - Multi-agent orchestration
   - RAG patterns in the wild
   - Refactors at scale
   - Greenfield with AI
   - Verification loops
3. Each bucket = 3–6 hand-curated real trails.
4. Source: apps/web/lib/featured-trails.ts (shared with PR1's featured strip). Hand-curated array of { slug, user, bucket, note }.
5. Add "Weekly AI Coding Patterns" email-capture CTA at the bottom. Just the CTA + storage — no pipeline. Seeds the content moat.

## PR3 (deferred)

DB-backed featured flag, saves/likes on trails, actual digest pipeline.

## Open questions

1. Do we have 12–18 trails good enough to feature today? If not, PR1 ships with fewer (3–4) and PR2 waits.
2. "Strava for AI coding" stays internal — never on the site.
