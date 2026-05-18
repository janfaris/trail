# trail

Record and share your AI coding sessions. A local CLI ingests Claude Code, Codex, Cursor, Hermes, Copilot CLI, and Copilot Chat session logs into SQLite, and a web app lets you publish anonymized sessions at `/u/<handle>/<slug>`.

## Why I made this

I do most of my real work inside AI coding tools now — Claude Code, Codex, Cursor, Copilot, Hermes. Every session has hours of prompts, decisions, and diffs that just vanish when I close the terminal. There's no way to find that fix from two weeks ago, no way to show a friend exactly how I solved something, no way to prove to a hiring manager that I actually know how to think with these tools.

So I built Trail. It tails the log files the tools already write — no proxying, no hooks, no slowdown. Sessions live in `~/.trail/db.sqlite` on your machine. Search across all your work in 2 seconds. Optionally share any session as a public link with secrets and absolute paths scrubbed first.

It's local-first. Nothing leaves your machine unless you explicitly run `trail share`. The model companies will eventually ship their own viewers, but only for their own tool. Trail is the cross-vendor, portable, social layer they won't build.

Built by [@jankarlo.faris](https://github.com/janfaris). Open source. Tell me if it's useful.

## Example sessions

- [Vantage codebase exploration](http://localhost:3000/u/jankarlo.faris/rwny7k24) — Claude Code, 116 events
- [Listing archival strategy design](http://localhost:3000/u/jankarlo.faris/og9nz2hm) — Claude Code, 111 events
- [Condosync repo setup with GitHub MCP](http://localhost:3000/u/jankarlo.faris/1xpcd992) — Cursor, 111 events
- [Artemis friend events bug](http://localhost:3000/u/jankarlo.faris/b73v7y0n) — Cursor, 83 events
- [usableai Spanish tone tuning](http://localhost:3000/u/jankarlo.faris/ziqxbxfp) — Copilot Chat, 89 events
- [Lupa pricing market research](http://localhost:3000/u/jankarlo.faris/057smo2q) — Claude Code, 41 events

## Quick start

```bash
git clone https://github.com/janfaris/trail.git
cd trail
pnpm install

# 1. Set up Postgres (Neon free tier works)
# 2. Create a GitHub OAuth app (callback: http://localhost:3000/api/auth/callback/github)
cp .env.example .env.local
# Fill in DATABASE_URL, GITHUB_CLIENT_ID/SECRET, BETTER_AUTH_SECRET

# 3. Run migrations
pnpm --filter @trail/web db:push

# 4. Build everything
export $(grep -v '^#' .env.local | xargs)
pnpm -r build

# 5. Run the web app
pnpm --filter @trail/web dev   # http://localhost:3000
```

End-to-end share flow:

```bash
node apps/cli/dist/index.js login           # opens browser, completes GitHub OAuth
node apps/cli/dist/index.js whoami          # prints @handle
node apps/cli/dist/index.js search "auth"   # find a session id
node apps/cli/dist/index.js share <id> --dry-run        # preview anonymization
node apps/cli/dist/index.js share <id> --yes --copy     # upload, copy URL
```

## Architecture

```
  apps/cli  ──┐
              ├──>  packages/{schema, parsers, anonymize, client}
  apps/web  ──┘

  apps depend on packages; packages never depend on apps;
  apps never depend on each other, they communicate via HTTP + shared types.
```

The CLI never imports from `apps/web`. The web app never imports from `apps/cli`.
They share types/runtime contracts through `packages/`.

## Where does X live?

  Session / event types ............ packages/schema
  Read Claude Code .jsonl .......... packages/parsers
  Secret/path/email scrubbing ...... packages/anonymize
  HTTP API contract + client ....... packages/client
  CLI commands ..................... apps/cli/src/commands/
  CLI auth flow / storage .......... apps/cli/src/lib/
  Web routes (pages + API) ......... apps/web/app/
  Web auth (better-auth + GitHub) .. apps/web/lib/auth.ts
  DB schema ........................ apps/web/db/schema.ts

## Commands

  pnpm install                          install all workspaces
  pnpm -r build                         build all packages + apps
  pnpm -r test                          run all vitest suites
  pnpm --filter @trail/anonymize test   single package tests
  pnpm --filter @trail/web dev          next dev server
  pnpm --filter @trail/web db:push      apply drizzle schema
  pnpm --filter @trail/cli build        build CLI bundle (tsup)
  node apps/cli/dist/index.js <cmd>     run the CLI

## Auth model (v0.1)

The CLI completes login by opening `/cli-auth?callback=http://127.0.0.1:<port>`
in your browser. After GitHub OAuth, `/cli-auth/success` reads the better-auth
session cookie via a server action and POSTs it back to the CLI's local
callback server. The CLI stores the cookie at `~/.trail/auth.json` (mode 0600)
and sends it on subsequent upload requests.

This forwards the raw session cookie to the CLI. It is acceptable for v0.1
because the user explicitly initiated `trail login`. A future phase will
replace this with a dedicated `cli_tokens` table and short-lived bearer
tokens scoped to upload-only (see TODO in `apps/web/app/cli-auth/success/actions.ts`).

## Menu bar app (optional)

A native SwiftUI menu bar app — `TrailBar.app` — shows your recent sessions in the macOS menu bar and lets you open or share them with one click. Source lives in [`apps/menubar/`](apps/menubar/README.md).

```bash
cd apps/menubar
./scripts/install.sh
```

Requires macOS 13+. Unsigned in v0.2 (right-click → Open on first launch).

## Status

  Phase 0  monorepo scaffolding             done
  Phase 1  schema + parsers                 done
  Phase 2  CLI record/view/search           done
  Phase 3  local web viewer                 done
  Phase 4  Next.js + Neon + auth + viewer   done
  Phase 5  CLI share end-to-end             done
  Phase 6  pricing, payments, team          next

## License

MIT
