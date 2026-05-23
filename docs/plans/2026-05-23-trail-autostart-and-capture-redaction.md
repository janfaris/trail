# Trail: Autostart + Capture-Time Redaction Plan

> **For Hermes:** Use subagent-driven-development to implement task-by-task.

**Goal:** Make `trail record` start itself on login and redact secrets at capture-time so users never have to remember to run it and the local DB never holds raw secrets.

**Architecture:** Two independent changes. (1) Ship a `trail daemon` subcommand + macOS launchd plist installer (`trail daemon install`) that runs `trail record` headlessly under launchd, restarts on crash, logs to `~/.trail/daemon.log`. Zero new background polling — record is already chokidar-based file-watching, idle = ~0% CPU. (2) Move the existing anonymizer (`@trail/anonymize`) from share-time to capture-time inside `record.ts` so `saveSession()` writes already-redacted text to local SQLite. Share-time stays as a second-pass safety net.

**Tech Stack:** Node 22, commander, chokidar (existing), `@trail/anonymize` (existing), macOS `launchctl` + `~/Library/LaunchAgents/*.plist`.

**Out of scope (explicitly):** Linux/Windows autostart, GUI status bar app, screen recording, network egress, auto-share.

---

### Task 1: Add `trail daemon status` subcommand

**Objective:** Show whether the daemon is currently loaded under launchd. Lays groundwork before install/uninstall.

**Files:**
- Create: `apps/cli/src/commands/daemon.ts`
- Modify: `apps/cli/src/index.ts` (register command)

**Step 1:** Write a test for `getDaemonStatus()` that shells out to `launchctl list com.trail.daemon` and parses presence. Mock child_process.

**Step 2:** Implement `daemon.ts` with `status` action only. Output: `running (pid 1234)`, `installed but not running`, or `not installed`.

**Step 3:** Register `trail daemon status` in `index.ts`.

**Step 4:** Manual verify: `pnpm --filter @trail/cli build && trail daemon status` → `not installed`.

**Step 5:** Commit `feat(cli): trail daemon status subcommand`.

---

### Task 2: Add `trail daemon install`

**Objective:** Write a launchd plist that runs `trail record` as a LaunchAgent, load it with `launchctl bootstrap`.

**Files:**
- Modify: `apps/cli/src/commands/daemon.ts`
- Create: `apps/cli/src/lib/launchd-plist.ts` (plist generator)

**Step 1:** Write test for `buildPlist({ binPath, logPath })` returning XML with `KeepAlive=true`, `RunAtLoad=true`, ProgramArguments=[binPath, "record"], StandardOutPath/StandardErrorPath=logPath.

**Step 2:** Implement generator.

**Step 3:** Add `install` action: writes plist to `~/Library/LaunchAgents/com.trail.daemon.plist`, runs `launchctl bootstrap gui/$UID <plist>`. Resolves binPath via `process.execPath` + script path or `which trail`.

**Step 4:** Manual verify: `trail daemon install && trail daemon status` → `running`. Tail `~/.trail/daemon.log`, confirm "watching..." lines appear.

**Step 5:** Commit `feat(cli): trail daemon install via launchd`.

---

### Task 3: Add `trail daemon uninstall` + `restart`

**Objective:** Symmetric removal so users can fully back out.

**Files:** `apps/cli/src/commands/daemon.ts`

**Step 1:** Test that uninstall calls `launchctl bootout gui/$UID/com.trail.daemon` then unlinks the plist.

**Step 2:** Implement uninstall + restart (bootout then bootstrap).

**Step 3:** Manual verify round-trip: install → status running → uninstall → status not installed → no plist on disk.

**Step 4:** Commit `feat(cli): trail daemon uninstall/restart`.

---

### Task 4: Capture-time redaction in `record.ts`

**Objective:** Run anonymizer on every parsed session before `saveSession()` so the local DB stores redacted text only.

**Files:**
- Modify: `apps/cli/src/commands/record.ts` (find every `saveSession(...)` call, wrap)
- Modify: `apps/cli/src/db.ts` (add a redaction-log column if not present — check schema first)

**Step 1:** Read existing share-time call to `anonymizeSession()` in `apps/cli/src/commands/share.ts` to mirror its API.

**Step 2:** Write a test in `apps/cli/test/` (create if needed) that feeds a fake session containing `sk-abc123...` and an email through the record pipeline and asserts the saved row has them redacted.

**Step 3:** Wrap each `saveSession(session)` site with `saveSession(anonymizeSession(session))`. Add a `redacted_at` timestamp + count of redactions to the session row.

**Step 4:** Test passes. Smoke-test: run `trail record` against a real Claude Code session that contains an API key, query local SQLite, confirm key is `[REDACTED:api_key]`.

**Step 5:** Update `share.ts` to skip re-anonymization if `redacted_at` is set (keep code path as safety fallback for old sessions).

**Step 6:** Commit `feat(cli): redact secrets at capture-time, not share-time`.

---

### Task 5: First-run UX — `trail init` suggests daemon install

**Objective:** Make the autostart discoverable without forcing it.

**Files:** `apps/cli/src/index.ts` (or wherever first-run hint lives)

**Step 1:** On any `trail` invocation when `~/.trail/db.sqlite` does not exist, print a one-time hint: `Tip: run 'trail daemon install' to capture sessions automatically.` Write `~/.trail/.hinted` to prevent repeat.

**Step 2:** Commit `feat(cli): suggest daemon install on first run`.

---

### Task 6: README + docs

**Objective:** Document the new flow.

**Files:** `README.md`, `docs/daemon.md`

**Step 1:** Add "Run it in the background" section with `trail daemon install`, status, uninstall.

**Step 2:** Add "Security: capture-time redaction" note explaining the local DB never holds raw secrets.

**Step 3:** Commit `docs: daemon mode + capture-time redaction`.

---

## Verification checklist (post-merge)

- [ ] `trail daemon install` on a fresh Mac → reboot → `trail daemon status` shows running
- [ ] Run a Claude Code session that includes an API key → query SQLite → key is redacted
- [ ] `trail daemon uninstall` removes plist + stops process
- [ ] CPU at idle (no AI session active): <0.1% per Activity Monitor
- [ ] `trail share <id>` of a session captured under the daemon shows zero redactions to apply (already done at capture)

## Notes / non-goals

- Linux/Windows autostart: file separate issues, use systemd user units / Task Scheduler. Don't block macOS ship on this.
- No telemetry, no auto-upload, no network calls added.
- Daemon is opt-in via explicit `install` command. Never installed by `npm install` or first run.
