# Trail Receipts: Freelance Client-Proof Wedge

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Reposition Trail as the tool freelancers and agencies use to prove AI-assisted work to paying clients. Single wedge, single buyer, real verification, real pricing.

**Architecture:** Receipt = concise, verified artifact derived from an existing Trail session. Verification gate: receipt cannot be marked `shipped` without a merged-to-main commit (GitHub API check). Receipt copy is LLM-generated with a tone-spec + validator to avoid AI slop. Sharing is gated by a 3-receipt free tier; unlimited + private behind Stripe at $9/mo.

**Tech Stack:** Existing Next.js 16 / Neon / Drizzle / better-auth web app + existing CLI. Add: Octokit (GitHub commit verification), Stripe (checkout + webhook), tone-spec markdown file, receipt validator (diagnostic-only, like usableai).

---

## Scope Cuts (read first)

The previous plan tried to serve PR review + client proof + hiring proof. This plan ships **client proof only**. PR review and hiring use cases reuse the same receipt artifact later — they are NOT V1 surfaces.

**Cut from V1:**
- Hiring portfolio framing on landing
- PR review framing on landing
- Discover / Learn / social pages (stay buried)
- Multi-buyer language anywhere in CLI/UI
- Renaming "trail" the noun — keep `trail` as the CLI/brand, `receipt` as the artifact it produces. ("A trail produces receipts.")

**In V1:**
- One landing page rewrite, freelance-only voice
- Receipt block above timeline, verified-or-draft badge
- GitHub merged-status verification (only acceptable proof for `shipped`)
- Tone-spec for receipt copy generation
- Stripe paywall: 3 free public receipts → $9/mo unlimited + private
- One CLI flow change: `trail share` outputs receipt URL + verification state

---

## Task 1: Tone spec for receipt copy

**Objective:** Lock the voice of receipt summaries before any LLM generation runs. Mirrors the usableai pattern.

**Files:**
- Create: `apps/web/prompts/receipt-tone-spec.md`

**Step 1: Write the tone spec**

```markdown
# Receipt Tone Spec

Receipts are read by paying clients deciding whether to trust AI-assisted work.

VOICE
- Plain. Specific. Past tense. No marketing.
- Lead with the outcome ("Added Stripe checkout with webhook retry"), not the process.
- Reference the actual files/commits. Never hand-wave ("various improvements").

BANNED
- "leveraged", "utilized", "robust", "seamless", "cutting-edge"
- Em-dashes used as performative pauses
- Sentences that start with "I" more than once per receipt
- Any claim of testing/verification not backed by the linked commit

REQUIRED
- 1-2 sentence outcome line
- Bullet list of 3-6 concrete decisions or tradeoffs
- File count + LOC delta if available
- If verification is missing, say so plainly ("Not yet merged.")
```

**Step 2: Commit**

```bash
git add apps/web/prompts/receipt-tone-spec.md
git commit -m "feat: receipt tone spec"
```

---

## Task 2: Receipt validator (diagnostic-only)

**Objective:** Catch slop in generated receipts before they go public. Diagnostic-only — never rewrites LLM output, only flags.

**Files:**
- Create: `apps/web/lib/receipt-validator.ts`
- Create: `apps/web/lib/receipt-validator.test.ts`

**Step 1: Write failing tests**

```ts
import { validateReceipt } from "./receipt-validator";

test("flags banned phrases", () => {
  const r = validateReceipt({ outcome: "Leveraged Stripe for seamless checkout", decisions: [] });
  expect(r.warnings).toContain("banned-phrase:leveraged");
  expect(r.warnings).toContain("banned-phrase:seamless");
});

test("flags missing decisions", () => {
  const r = validateReceipt({ outcome: "Added auth", decisions: [] });
  expect(r.warnings).toContain("missing-decisions");
});

test("passes clean receipt", () => {
  const r = validateReceipt({
    outcome: "Added Stripe checkout with webhook retry.",
    decisions: ["Picked Stripe over Lemon Squeezy for PR market", "Idempotent webhook handler"],
  });
  expect(r.warnings).toEqual([]);
});
```

**Step 2: Implement**

```ts
const BANNED = ["leveraged", "utilized", "robust", "seamless", "cutting-edge", "blazing", "lightning-fast"];

export function validateReceipt(r: { outcome: string; decisions: string[] }) {
  const warnings: string[] = [];
  const text = (r.outcome + " " + r.decisions.join(" ")).toLowerCase();
  for (const w of BANNED) if (text.includes(w)) warnings.push(`banned-phrase:${w}`);
  if (r.decisions.length < 3) warnings.push("missing-decisions");
  if (r.outcome.length > 240) warnings.push("outcome-too-long");
  return { warnings, ok: warnings.length === 0 };
}
```

**Step 3: Run tests, commit**

```bash
pnpm --filter @trail/web test receipt-validator
git add apps/web/lib/receipt-validator.ts apps/web/lib/receipt-validator.test.ts
git commit -m "feat: receipt diagnostic validator"
```

---

## Task 3: GitHub merged-status verification

**Objective:** A receipt cannot claim `shipped` without proof. Proof = linked commit SHA appears in the default branch of the linked repo.

**Files:**
- Create: `apps/web/lib/github-verify.ts`
- Create: `apps/web/lib/github-verify.test.ts`
- Modify: `apps/web/db/schema.ts` (add `receiptVerifiedAt`, `receiptVerifiedSha` columns)

**Step 1: Schema migration**

Add to sessions table:
```ts
receiptVerifiedAt: timestamp("receipt_verified_at"),
receiptVerifiedSha: text("receipt_verified_sha"),
```

Migration via existing `/api/admin/migrate` pattern (Bearer CRON_SECRET).

**Step 2: Implement verifier**

```ts
import { Octokit } from "@octokit/rest";

export async function verifyShipped(repo: string, sha: string): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const { data: r } = await gh.repos.get({ owner, repo: name });
  try {
    await gh.repos.compareCommitsWithBasehead({
      owner, repo: name,
      basehead: `${r.default_branch}...${sha}`,
    });
    // If sha is reachable from default branch, compare returns ahead_by: 0
    return true;
  } catch { return false; }
}
```

(Refine: ahead_by===0 means sha is ancestor of default branch = merged.)

**Step 3: Tests + commit**

Mock Octokit; assert merged sha returns true, non-merged returns false.

```bash
git commit -m "feat: github merged-status verification for receipts"
```

---

## Task 4: Receipt generation pipeline

**Objective:** Generate receipt copy from a session using the tone spec, validate, store, surface verification state.

**Files:**
- Modify: `apps/web/lib/recipe-gen.ts` → rename internally to receipt-gen, keep existing function for compat
- Create: `apps/web/app/api/sessions/[id]/regenerate-receipt/route.ts`

**Step 1: Build the prompt**

System prompt loads `prompts/receipt-tone-spec.md` verbatim. User prompt: session highlights + linked commit + changed files.

**Step 2: Generate → validate → store**

```ts
const draft = await generateWithLLM(session);
const { warnings } = validateReceipt(draft);
// Store warnings on the session for admin visibility; do NOT block.
await db.update(sessions).set({
  recipeOutcome: draft.outcome,
  recipeTldr: draft.decisions.join("\n"),
  receiptValidatorWarnings: warnings,
}).where(eq(sessions.id, id));
```

**Step 3: Verification call**

If `linkedRepo` + `linkedCommitSha` present, call `verifyShipped`. Store result.

**Step 4: Commit**

```bash
git commit -m "feat: receipt generation with tone-spec + verification"
```

---

## Task 5: Receipt block on session page

**Objective:** Receipt is the primary artifact. Timeline is secondary.

**Files:**
- Modify: `apps/web/app/u/[user]/[slug]/page.tsx`
- Create: `apps/web/components/receipt-block.tsx`

**Layout:**
- Top: ReceiptBlock — outcome line, decisions list, changed files, badge (`Shipped ✓` if `receiptVerifiedAt`, else `Draft`)
- Actions: Copy receipt link, Copy receipt summary (markdown), Regenerate (auth'd owner only)
- Below: collapsed `View full timeline →` link

**Badge rules:**
- `Shipped ✓` (green): `receiptVerifiedAt` is set
- `Draft` (gray): linked commit but not merged yet
- `Unverified` (amber): no linked commit at all

**Commit:**

```bash
git commit -m "feat: receipt block above timeline on session page"
```

---

## Task 5.5: Receipt PNG renderer (thermal-receipt aesthetic)

**Objective:** Render each receipt as a deterministic PNG that looks like a paper thermal receipt. Doubles as the OG image so iMessage/Twitter/Discord previews show the receipt itself. Deterministic Skia render — no LLM image gen.

**Why not gpt-image-2:** non-deterministic (badge/filenames misalign every render), ~$0.04 + 8–15s per image, and the data is structured (fixed fields) so AI image gen is the wrong tool. Skia gives pixel-perfect, free, sub-second, reproducible output — same approach usableai uses for slides.

**Files:**
- Add dep: `skia-canvas` to `apps/web`
- Create: `apps/web/lib/receipt-image.ts` (renderer)
- Create: `apps/web/app/r/[id]/image.png/route.ts` (PNG endpoint)
- Modify: `apps/web/app/r/[id]/page.tsx` (set OG image meta to the PNG route)

**Layout (600×900, monospace, black-on-cream):**
- Header: `TRAIL ━━━━━━━━━━━━━━━━━━━━` + receipt ID short hash
- Date row, AI tool row (Claude Code / Codex / Copilot)
- Dashed divider `- - - - - - - - - - - -`
- OUTCOME (wrapped, max 3 lines, from `recipeTldr`)
- Dashed divider
- Itemized: `<N> files changed`, `<N> commits`, `<N> redactions`
- Commit row: `commit abc1234` (short SHA)
- Dashed divider
- Footer badge: `✓ SHIPPED` (green) / `◐ DRAFT` (amber) / `⚠ UNVERIFIED` (red)
- Bottom: `trail.dev/r/<id>` (URL)

**Step 1: Renderer**

```ts
// apps/web/lib/receipt-image.ts
import { Canvas } from 'skia-canvas';

export async function renderReceiptPng(receipt: ReceiptData): Promise<Buffer> {
  const canvas = new Canvas(600, 900);
  const ctx = canvas.getContext('2d');
  // cream bg, mono font, fixed layout, wrap outcome to 3 lines max
  // ... draw header, dividers, fields, badge, url
  return await canvas.toBuffer('png');
}
```

**Step 2: PNG route**

```ts
// apps/web/app/r/[id]/image.png/route.ts
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const receipt = await getReceiptById(params.id);
  if (!receipt || !receipt.public) return new Response('Not found', { status: 404 });
  const png = await renderReceiptPng(receipt);
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
```

Cache key = receipt id + updatedAt; regenerate only when receipt data changes.

**Step 3: Wire OG image**

In `app/r/[id]/page.tsx` generateMetadata, set `openGraph.images` and `twitter.images` to `/r/<id>/image.png`. Paste-in-iMessage = receipt preview.

**Verification:**
- Render two receipts, diff PNGs byte-by-byte for the same input → identical (determinism check)
- Paste receipt URL in iMessage → preview shows the PNG, not the page screenshot
- Sub-second render time

**Pitfalls:**
- Skia-canvas needs platform binaries; verify Vercel build picks the right one (test deploy before merging)
- Monospace font must be bundled (`Geist Mono`) — don't rely on system fonts
- Long file lists: cap at 5 files shown + `+N more` row, don't blow past 900px height

---

## Task 6: Landing page rewrite — freelance only

**Objective:** One buyer, one voice, one CTA. No more "AI coding portfolio."

**Files:**
- Modify: `apps/web/app/page.tsx`

**Copy direction (final wording lives in PR, not plan):**

- Hero: "Prove the AI-assisted work you ship. For freelancers and agencies whose clients ask, 'did you actually build this?'"
- Sub: "Trail records your AI sessions locally, then produces a verified receipt linked to the merged commit. Share the link. Done."
- Primary CTA: "See an example receipt" → links to a real public receipt of yours
- Secondary CTA: `brew install trail` (or current install path)
- Three-row proof strip: "Merged to main ✓ — Anonymized ✓ — Linked commit ✓"

**No mention of:** hiring, recruiters, learning, discovery, social, portfolio.

**Commit:**

```bash
git commit -m "feat: landing page rewrite — freelance client-proof"
```

---

## Task 7: Stripe paywall — 3 free, $9/mo unlimited + private

**Objective:** Price is the validation. Free → 3 public receipts lifetime. Paid → unlimited + private receipts.

**Files:**
- Create: `apps/web/app/api/stripe/checkout/route.ts`
- Create: `apps/web/app/api/stripe/webhook/route.ts`
- Modify: `apps/web/db/schema.ts` (add `users.plan`, `users.stripeCustomerId`)
- Modify: `apps/web/app/api/sessions/upload/route.ts` (enforce 3-receipt limit for free)

**Step 1: Schema**

```ts
plan: text("plan").default("free").notNull(), // 'free' | 'pro'
stripeCustomerId: text("stripe_customer_id"),
```

**Step 2: Enforce limit on upload**

```ts
if (user.plan === "free") {
  const count = await db.select({ c: count() }).from(sessions).where(eq(sessions.userId, user.id));
  if (count[0].c >= 3) return Response.json({ error: "upgrade-required" }, { status: 402 });
}
```

**Step 3: Webhook handles `checkout.session.completed` → set plan='pro'**

**Step 4: Tiny upgrade page**

`/upgrade` — single button, Stripe Checkout redirect. No marketing.

**Commit:**

```bash
git commit -m "feat: stripe paywall — 3 free receipts, $9/mo pro"
```

---

## Task 8: CLI share output update

**Objective:** Language and output match the receipt framing.

**Files:**
- Modify: `apps/cli/src/commands/share.ts`

**Changes:**
- "Session uploaded" → "Receipt created"
- After URL, print verification state on its own line:
  - `Status: Shipped ✓ (merged in <repo>@<sha>)`
  - `Status: Draft (commit not yet on default branch)`
  - `Status: Unverified (no commit linked — pass --commit <sha>)`
- Add optional `--commit <sha>` and `--repo owner/name` flags so users can link from CLI

**Commit:**

```bash
git commit -m "feat(cli): receipt framing + verification status in share output"
```

---

## Validation (real, not vibes)

**Cohort:** 10 freelancers/agency owners who use Claude Code, Codex, or Cursor for client work. Not "AI-heavy developers" — actual people billing clients.

**Recruit:** post in Indie Hackers, r/freelance, X reply guy in AI-freelance threads.

**Metrics (sharp):**
- ≥5/10 sign up after the landing page (no further pitch)
- ≥3/10 share a receipt link to a client / coworker / public within 7 days
- ≥1/10 hits the paywall and pays
- 0/10 say the receipt "sounds like AI"

**Kill criteria:** if <3 share externally within 7 days, the wedge isn't real. Reconsider before building more.

---

## Out of scope (explicit)

- Team / multi-seat receipts
- Receipt analytics (views, copy counts)
- PR review surfaces (comment bots, GitHub App)
- Hiring portfolio framing
- Discover / Learn pages
- Multi-language receipts
- Mobile app
- Self-hosting

Each of these is a viable later wedge. None of them help validate "freelancers pay for verified AI work receipts."

---

## Execution

Ready to execute task-by-task via subagent-driven-development. Each task = its own PR. Two-stage review (spec + quality) between tasks. Stop after Task 6 (landing + receipt block + verification shipped, no paywall yet) and validate with 3 freelancers before committing to Task 7 Stripe work.
