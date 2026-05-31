# Copilot instructions for `trail`

`trail` is a pnpm + Turbo monorepo (Next.js 16 web app, a CLI, and shared packages)
that ingests AI coding-agent session logs, parses them, and renders them. These notes
capture conventions and recurring pitfalls so changes land correctly the first time.

## Product direction: social network for AI builders

Trail should feel like the proof-of-work social network for AI-native builders, not a
marketing site or analytics dashboard. Product changes should reinforce this loop:

1. Builder imports or creates an AI coding session.
2. Trail turns it into a clear public shipping receipt.
3. Other builders discover it in feed/discovery/profile surfaces.
4. They follow, react, comment, save, fork, or share it.
5. Notifications, recaps, reputation, and profile status pull the builder back to ship
   again.

When improving social surfaces:

- Treat `/feed` as the primary product surface: timeline first, not hero first.
- Use familiar social verbs: follow, react, comment, share, publish, save, fork, and
  open receipt.
- Make every public receipt read like a post plus proof artifact: builder identity,
  outcome, tools/stack, proof metrics, social proof, and an obvious conversation entry.
- Signed-in users should see personalization quickly: Following, recommendations,
  notifications, and "people like me" builder discovery.
- Anonymous users should immediately understand the network and be nudged to sign in,
  follow builders, import their first session, or publish a receipt.
- Empty states should never be dead ends; push toward following, importing, publishing,
  or browsing trending builders/stacks.
- Prefer social proof and creator identity over generic marketing claims. Avoid placing
  large marketing hero sections above the timeline on social pages.
- Mobile feed pages should not stack multiple sticky headers; keep the reading and
  action flow simple.

North star: weekly public shipping receipts created by active builders. Important input
metrics include activation to first public receipt, follows per activated builder,
reaction/comment rate per receipt, notification return rate, D7 retention, and shares
that lead to new signups.

## Working agreements

- **Stay on the current branch.** Do not switch branches or create new ones unless the
  user explicitly asks. Commit directly to the branch you are already on.
- **Make surgical, additive edits to shared files.** `apps/web/db/schema.ts` and other
  shared modules are frequently edited by parallel work. Append/extend rather than
  rewriting existing definitions, and avoid reformatting code you didn't touch.

## Database & schema workflow

- The schema is a single source of truth at **`apps/web/db/schema.ts`**.
- **There are no migration files.** Sync the database by pushing the schema, never by
  generating/applying migrations:
  ```bash
  pnpm --filter @trail/web db:push   # drizzle-kit push
  ```
- Drizzle loads env from the **repo-root `.env.local`** (`drizzle.config.ts` reads
  `../../.env.local`). DB commands fail without `DATABASE_URL` set there.

## Don't touch the DB at module-evaluation time (Next.js / Vercel)

Importing modules that connect to or query the database at the **top level** of a route,
layout, or OG-image handler causes the Vercel build to fail during "Collecting page
data" with:

```
Error: DATABASE_URL is not set
```

Next pre-renders/evaluates these modules at build time, when env may be absent. Keep
DB-coupled imports (e.g. `lib/auth.ts`, anything importing `db/`) **out of module
scope** and load them lazily **inside** the handler instead:

```ts
// avoid: import { auth } from "@/lib/auth"  at top of a route
export async function GET() {
  const { auth } = await import("@/lib/auth"); // deferred
  // ...
}
```

This pattern has already required multiple fix-up commits — apply it proactively for any
new route/OG handler that needs the DB.

## Parser convention

Source parsers live in **`packages/parsers/src/<source>.ts`** — one file per source
(e.g. `claude-code.ts`, `anthropic-org.ts`, `codex.ts`, `cursor.ts`). Each has a paired
test in **`packages/parsers/test/<source>.test.ts`** with fixtures.

When adding or changing a parser, **read an existing parser first** (e.g.
`claude-code.ts`) and match its shape exactly — exports, types, and structure — then
register it in `packages/parsers/src/index.ts` and add the sibling test.

## Monorepo boundaries

- `apps/*` may depend on `packages/*`.
- `packages/*` must **never** depend on `apps/*`.
- `apps/*` must **never** import each other; communicate via HTTP + shared types in
  `packages/*`.

## Build, lint, test

```bash
# Build everything (export env first; the web build needs it)
export $(grep -v '^#' .env.local | xargs)
pnpm -r build

# Lint / format (Biome: 2-space, double quotes, semicolons, lineWidth 100)
pnpm lint        # biome check .
pnpm format      # biome format --write .

# Tests (vitest via turbo)
pnpm test                          # all packages
pnpm --filter @trail/<pkg> test    # a single package, e.g. @trail/parsers
```

TypeScript is strict with `noUncheckedIndexedAccess`; account for possibly-undefined
indexed access.
