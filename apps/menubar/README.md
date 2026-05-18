# TrailBar — macOS menu bar app

A native SwiftUI menu bar companion for [Trail](https://gettrail.vercel.app). Shows your recent AI coding sessions in the system menu bar, lets you open, share, and view them with one click.

## Requirements

- macOS 13 Ventura or later
- The `trail` CLI installed at `~/.local/bin/trail` (or anywhere in `PATH`)
- Swift 6.x toolchain (Xcode Command Line Tools is enough) for building from source
- `~/.trail/db.sqlite` (created automatically the first time you run `trail record`)

## Install (from source)

```bash
cd apps/menubar
./scripts/install.sh
```

This builds a release binary, assembles an unsigned `TrailBar.app` in `.build/`, copies it to `/Applications/`, and launches it. A `list.bullet.rectangle` icon appears in your menu bar.

> **First launch / Gatekeeper:** the app is unsigned in v0.2. If macOS refuses to open it from `/Applications`, right-click it in Finder → **Open** → **Open** to confirm. After that it launches normally.

## Build only

```bash
./scripts/build-app.sh
# → apps/menubar/.build/TrailBar.app
```

## What it does

- Header row: `Today: N · Total: M` session counts
- Up to 8 most recent sessions, each showing the first prompt (60-char preview), tool, event count, and age
- Click a session:
  - already shared → opens the share URL in your browser
  - not shared yet → runs `trail share <id> --yes --copy`, copies + opens the new URL
- Right-click any session for **View in Terminal / Share… / Copy Share URL / Copy Session ID**
- **Open Profile** opens `https://gettrail.vercel.app/u/jankarlo.faris`
- **Refresh** forces an immediate reload
- **Quit Trail** (⌘Q)

The store auto-refreshes every 30 seconds and also watches `~/.trail/db.sqlite` via a `DispatchSource` file-system event, so new sessions show up within seconds of being recorded.

## Variables (v0.2)

For now the web base URL and profile handle are baked in (`https://gettrail.vercel.app`, `jankarlo.faris`). A settings panel is planned for v0.3; in the meantime tweak `TrailCLI.webBaseURL` and the profile URL in `MenuView.swift` if you fork it.

## Architecture

- `TrailBarApp.swift` — `@main` SwiftUI `App` with a `MenuBarExtra` scene
- `MenuView.swift` — the popover content
- `SessionStore.swift` — `ObservableObject` that polls + watches the DB file
- `TrailDB.swift` — `libsqlite3` read-only access (no daemon, no IPC)
- `TrailCLI.swift` — `Process()` wrapper around `~/.local/bin/trail`
- `SessionRow.swift` — single-row view with context menu
- `Models.swift` — `SessionSummary` value type

The SQL query that powers the "Recent" list is intentionally identical to the one the xbar plugin uses (`extras/xbar/trail.30s.sh`) so both surfaces show the same data.

## Why not Xcode?

The project is a plain Swift Package — no `.xcodeproj`. `scripts/build-app.sh` hand-assembles the `.app` bundle from `swift build -c release` output. This makes CI cheap and lets you build the app on any machine with the Swift toolchain.

## Roadmap

- v0.3: settings panel (web URL, profile handle, refresh interval), auto-launch on login (`SMAppService`)
- v1.0: Apple Developer ID signing + notarization, custom `.icns`, login state UI

## See also

- xbar plugin: `extras/xbar/` — same data, different host
