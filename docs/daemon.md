# Trail daemon (macOS)

Trail can run as a background LaunchAgent that watches your AI CLI session files and ingests new events into `~/.trail/db.sqlite` continuously. You don't need a terminal window open, and you don't need to remember to run `trail record`.

## What it does

A long-lived Node process uses [chokidar](https://github.com/paulmillr/chokidar) to watch the session-log directories of supported AI tools:

- Claude Code (`~/.claude/projects/**/*.jsonl`)
- Codex (`~/.codex/sessions/**/*.jsonl`)
- Cursor (workspace storage `*.vscdb`)
- GitHub Copilot CLI + Copilot Chat

When a session file changes, the daemon parses only the new tail, normalizes events, redacts secrets at capture time, and writes them to SQLite. Idle CPU is effectively 0% — chokidar uses native FS events, no polling.

The daemon is **opt-in**. It is never installed by `npm install` or by running `trail` for the first time. The first time you run any `trail` command without a database, you'll see a one-time hint suggesting `trail daemon install`. After that, silence.

## Install / status / uninstall

```bash
trail daemon install     # writes ~/Library/LaunchAgents/com.trail.daemon.plist, loads it
trail daemon status      # prints "running (pid N)" or "stopped"
trail daemon uninstall   # bootout + remove the plist
trail daemon restart     # bounce the agent (after a CLI upgrade, for example)
```

The LaunchAgent lives at `~/Library/LaunchAgents/com.trail.daemon.plist` and is loaded under your user session — it does not require sudo, and it does not run as root.

## Logs

stdout and stderr are redirected to `~/.trail/daemon.log`. Tail it if something looks wrong:

```bash
tail -f ~/.trail/daemon.log
```

## Platform support

macOS only in v0.2. Linux (systemd --user) and Windows (Task Scheduler) are on the roadmap. On non-macOS platforms `trail daemon install` exits with a clear error, and the first-run hint is suppressed.

## Security: capture-time redaction

Trail redacts secrets **before** they are written to your local SQLite database — not at share time. API keys, OAuth tokens, AWS credentials, and email addresses are stripped during ingest, and each session row records a `redacted_at` timestamp marking that the capture-time redaction pass ran.

This matters because the threat model isn't only "user accidentally shares a session publicly." It's also "laptop is stolen, backup is leaked, another process on the box reads `~/.trail/db.sqlite`." Capture-time redaction means even those scenarios don't leak live credentials.

Share-time anonymization (`packages/anonymize`) still runs on top — paths, usernames, and project names get scrubbed when you publish — but the secret-stripping floor is set at ingest.

See `apps/cli/src/lib/capture-redact.ts` and the `redacted_at` column in the sessions schema.
