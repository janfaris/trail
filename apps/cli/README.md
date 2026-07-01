# @gettrail/cli

Local-capture CLI for cost-per-PR tracking on Claude Code, Codex, and other AI coding agents.

No admin keys, no proxy, no rewiring your agents. Trail tails your local agent log files (Claude Code, Codex JSONL), prices each turn at upload time, and attributes the cost to the merge commit when you ship.

## Install

```bash
npm install -g @gettrail/cli
```

Requires Node.js >= 22 (uses the built-in `node:sqlite` module — no native binaries to install, no `node-gyp`).

## Quick start

```bash
trail login            # GitHub OAuth via gettrail.vercel.app
trail record &         # start the background daemon (tails Claude Code + Codex logs)
# ... work normally with Claude Code / Codex ...
trail share <id>       # anonymize + upload a session
```

Open https://gettrail.vercel.app/dashboard/cost to see $/PR across your shipped work.

## Work locally (no network)

Everything you capture stays in `~/.trail/db.sqlite`. Find, replay, and recap it without signing in:

```bash
trail search "auth bug"     # ranked full-text search across all local sessions
trail show <id>             # replay a session's timeline in the terminal
trail show <id> --event 7   # jump straight to one event (prompt, diff, tool call)
trail show <id> --full      # expand every prompt, diff, and tool I/O
trail recap --week          # private summary: sessions, tools, and totals (last 7 days)
```

## What gets captured

- Per-turn input / output / cached tokens
- Model name (e.g. `gpt-5.5`, `claude-sonnet-4-5`)
- Git context (repo, commit SHA) at the time of capture
- The session's prompts, completions, tool calls, file diffs

What does NOT leave your machine until you run `trail share`:

- Anything. The local SQLite at `~/.trail/db.sqlite` is yours.

When you share, sessions are anonymized client-side (secrets, paths, emails, internal hosts) before upload. The entropy guard holds high-entropy tokens for review before publishing.

## Security

This package is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements). Every published version carries a cryptographic attestation linking it to the exact GitHub commit and workflow that built it. Verify with:

```bash
npm install -g @gettrail/cli
npm audit signatures
```

Built and published from https://github.com/janfaris/trail via GitHub Actions OIDC — no long-lived npm tokens.

## Commands

```
trail login              Sign in via GitHub OAuth
trail logout             Clear local credentials
trail whoami             Show current user
trail record [--once]    Tail tool log directories (background daemon)
trail list [--limit N]   List local sessions
trail search <query>     Full-text search local sessions (--remote, --json)
trail show <id>          Replay a session timeline (--event N, --full, --json)
trail recap [--week]     Private local summary of what you shipped (--days N, --json)
trail view <id>          Show a session in the local viewer
trail share <id>         Anonymize and upload a session, return public URL
trail status             Show daemon status
```

Full docs: https://gettrail.vercel.app/install

## License

MIT — see [LICENSE](./LICENSE).
