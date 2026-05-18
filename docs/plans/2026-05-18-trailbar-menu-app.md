# TrailBar — Native macOS Menu Bar App Implementation Plan

> **For Hermes:** Bite-sized SPM-based tasks. No Xcode required.

**Goal:** Ship `TrailBar.app` — a native SwiftUI menu bar app that shows recent Trail sessions, opens shares, and links to the profile, replacing the xbar plugin with a real `.app` users can drag to `/Applications`.

**Architecture:**
- SwiftUI `MenuBarExtra` (macOS 13+) backed by an `@MainActor` `SessionStore`
- Reads `~/.trail/db.sqlite` directly via libsqlite3 (no daemon, no IPC)
- Polls every 30s + file-mtime check (DispatchSource on db file)
- Share/open shell out to the existing `trail` CLI binary
- Built with Swift Package Manager → hand-rolled `.app` bundle (no Xcode needed)
- Unsigned `.app` in `apps/menubar/.build/TrailBar.app` for v0.2; signing for v1.0

**Tech Stack:** Swift 6.2, SwiftUI, MenuBarExtra, libsqlite3, AppKit (NSWorkspace for opening URLs).

**Tree:**
```
apps/menubar/
  Package.swift
  Sources/TrailBar/
    TrailBarApp.swift          # @main, MenuBarExtra
    MenuView.swift             # the popover content
    SessionStore.swift         # @Observable, polling + sqlite reads
    SessionRow.swift           # one row component
    TrailCLI.swift             # shell out wrapper (share, view, login)
    TrailDB.swift              # sqlite3 query layer
    Models.swift               # SessionSummary struct
  Resources/
    Info.plist                 # LSUIElement=true, bundle id, etc.
    TrailBar.entitlements      # sandbox off for v0.2 (CLI shell-out)
  scripts/
    build-app.sh               # swift build + assemble .app bundle
    install.sh                 # copy to /Applications, launch
  README.md
```

**Distribution v0.2:** GitHub Releases attaches `TrailBar.zip`; README says "double-click, right-click → Open the first time to bypass Gatekeeper." v1.0 = Apple Dev ID + notarization.

---

### Task 1: Scaffold SPM package with empty executable

**Objective:** Create the directory structure and a hello-world `swift run`-able binary.

**Files:**
- Create: `apps/menubar/Package.swift`
- Create: `apps/menubar/Sources/TrailBar/TrailBarApp.swift`
- Create: `apps/menubar/.gitignore`

**Step 1:** Write `Package.swift` with macOS 13 platform, single executable target named `TrailBar`, linking systemLibrary `sqlite3`.

**Step 2:** Write a minimal `TrailBarApp.swift` that prints "TrailBar boot ok" so we can verify the toolchain works before adding SwiftUI.

**Step 3:** `cd apps/menubar && swift build` — expected: builds cleanly with no warnings.

**Step 4:** `swift run TrailBar` — expected: prints `TrailBar boot ok`.

**Step 5:** Commit `chore(menubar): scaffold SPM package`.

---

### Task 2: Minimal MenuBarExtra "Hello"

**Objective:** Get an icon into the macOS menu bar with a dropdown that says "Hello".

**Files:**
- Modify: `apps/menubar/Sources/TrailBar/TrailBarApp.swift`

**Step 1:** Replace `main()` with `@main struct TrailBarApp: App` that returns a `MenuBarExtra("Trail", systemImage: "list.bullet.rectangle")` containing a `Text("Hello")` and a `Button("Quit") { NSApplication.shared.terminate(nil) }`.

**Step 2:** `swift run TrailBar` — expected: icon appears top-right of menu bar.

**Step 3:** Click icon → "Hello" + Quit visible. Click Quit → process exits.

**Step 4:** Commit `feat(menubar): minimal MenuBarExtra with Quit`.

---

### Task 3: SQLite query layer

**Objective:** Read recent sessions from `~/.trail/db.sqlite` and return `[SessionSummary]`.

**Files:**
- Create: `apps/menubar/Sources/TrailBar/Models.swift` — `struct SessionSummary { id, tool, startedAt: Date, eventCount, shareSlug?, firstPrompt? }`
- Create: `apps/menubar/Sources/TrailBar/TrailDB.swift` — opens `~/.trail/db.sqlite` read-only, runs the same query the xbar plugin uses (port from `extras/xbar/trail.30s.sh` SQL), returns Swift array.

**Step 1:** Write `TrailDB.recent(limit: Int) throws -> [SessionSummary]` using `sqlite3_open_v2(..., SQLITE_OPEN_READONLY, ...)`, prepared statement, `sqlite3_step` loop, proper finalize/close in defer.

**Step 2:** Add a temporary `print` in `TrailBarApp.init` that calls `TrailDB.recent(limit: 5)` and prints rows.

**Step 3:** `swift run TrailBar` — expected: prints 5 recent sessions matching what `sqlite3 ~/.trail/db.sqlite "SELECT id,tool FROM sessions ORDER BY started_at DESC LIMIT 5"` shows.

**Step 4:** Remove temp print, commit `feat(menubar): sqlite read layer for recent sessions`.

---

### Task 4: Observable SessionStore with 30s polling

**Objective:** Background timer + file-mtime watch on db.sqlite. UI auto-refreshes when new sessions land.

**Files:**
- Create: `apps/menubar/Sources/TrailBar/SessionStore.swift`

**Step 1:** Implement `@Observable final class SessionStore` with:
  - `var recent: [SessionSummary] = []`
  - `var todayCount: Int = 0`
  - `var totalCount: Int = 0`
  - `var lastError: String? = nil`
  - `func refresh()` calls `TrailDB.recent(limit: 8)` on a background queue, hops to `@MainActor` to assign.
  - `init()` starts a `Timer.scheduledTimer(withTimeInterval: 30, ...)` and a `DispatchSource.makeFileSystemObjectSource` on the db file watching `.write`.

**Step 2:** Wire `@State private var store = SessionStore()` into `TrailBarApp`, show `Text("\(store.recent.count) sessions")` in the menu.

**Step 3:** `swift run TrailBar`, click icon — expected: shows current count. Run `trail record` in another shell, expected count updates within 30s.

**Step 4:** Commit `feat(menubar): Observable SessionStore with poll + fs watch`.

---

### Task 5: MenuView with real rows

**Objective:** Render the actual menu — title, today count, recent session rows with tool/event count/age.

**Files:**
- Create: `apps/menubar/Sources/TrailBar/MenuView.swift`
- Create: `apps/menubar/Sources/TrailBar/SessionRow.swift`

**Step 1:** Build `MenuView` with sections:
  - Header: `Text("Today: \(store.todayCount) · Total: \(store.totalCount)")`
  - Divider
  - Section("Recent") with `ForEach(store.recent)` of `SessionRow(session:)`
  - Divider
  - `Button("Open profile") { NSWorkspace.shared.open(URL(string: "https://gettrail.vercel.app/u/jankarlo.faris")!) }`
  - `Button("Refresh") { store.refresh() }`
  - `Button("Quit") { NSApplication.shared.terminate(nil) }`

**Step 2:** `SessionRow` shows: 60-char-trimmed first prompt, `tool · N ev · 4h` subtitle, `↗` glyph if `shareSlug != nil`. Use SF Symbols for tool icons (no custom assets yet).

**Step 3:** `swift run TrailBar`, click — expected: matches the xbar plugin layout but native.

**Step 4:** Commit `feat(menubar): menu rows for recent sessions`.

---

### Task 6: Click actions — view, share, copy URL

**Objective:** Each row's row-button performs a Default action; right-click reveals View/Share/Copy submenu.

**Files:**
- Create: `apps/menubar/Sources/TrailBar/TrailCLI.swift` — wraps `Process()` calls to `~/.local/bin/trail`.
- Modify: `apps/menubar/Sources/TrailBar/SessionRow.swift`

**Step 1:** `TrailCLI` exposes:
  - `static func binaryPath() -> URL?` — finds `~/.local/bin/trail` or `which trail`
  - `static func share(id: String, completion: @escaping (Result<String, Error>) -> Void)` — runs `trail share <id> --yes --copy --base-url https://gettrail.vercel.app`, parses URL from stdout
  - `static func viewInTerminal(id: String)` — opens Terminal.app via `NSWorkspace`, runs `trail view <id>` (use AppleScript `tell application "Terminal" to do script`)

**Step 2:** Default click on row: if already shared → opens URL in browser. If not → triggers share, shows notification on success.

**Step 3:** Add `.contextMenu` with View locally / Share / Copy URL items.

**Step 4:** Manual test: click an unshared session → share runs → URL opens. Click a shared one → opens existing URL.

**Step 5:** Commit `feat(menubar): share/view/copy actions per row`.

---

### Task 7: Hand-rolled .app bundle

**Objective:** `scripts/build-app.sh` produces `TrailBar.app` that can be dragged to `/Applications`.

**Files:**
- Create: `apps/menubar/Resources/Info.plist` — `LSUIElement=true` (hides Dock icon), `CFBundleIdentifier=app.gettrail.menubar`, `CFBundleName=TrailBar`, `CFBundleVersion=0.2.0`, `LSMinimumSystemVersion=13.0`.
- Create: `apps/menubar/scripts/build-app.sh`
- Create: `apps/menubar/scripts/install.sh`

**Step 1:** `build-app.sh`:
```bash
swift build -c release --arch arm64 --arch x86_64
APP="$(pwd)/.build/TrailBar.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/apple/Products/Release/TrailBar "$APP/Contents/MacOS/TrailBar"
cp Resources/Info.plist "$APP/Contents/Info.plist"
echo "✓ Built $APP"
```

**Step 2:** `install.sh`:
```bash
./scripts/build-app.sh
cp -R .build/TrailBar.app /Applications/
open /Applications/TrailBar.app
```

**Step 3:** Run `./scripts/install.sh` — expected: icon appears in menu bar, app is in `/Applications`, double-clicking it works.

**Step 4:** Commit `feat(menubar): build + install scripts produce .app bundle`.

---

### Task 8: README + repo wiring

**Objective:** Document install. Update root README pointing to menu bar app.

**Files:**
- Create: `apps/menubar/README.md`
- Modify: `README.md` (root) — add a "Menu bar app (optional)" section
- Modify: `extras/xbar/README.md` — add a "Prefer the native app? See `apps/menubar/`" note

**Step 1:** Write `apps/menubar/README.md`:
- Requirements (macOS 13+)
- Build from source (`./scripts/install.sh`)
- Permissions caveat (right-click → Open on first launch until signed)
- Variables section (db path, web URL — read from env? maybe Task 9)

**Step 2:** Commit `docs(menubar): README + cross-links`.

---

### Task 9 (stretch, may slip to next session): GitHub Releases artifact

**Objective:** CI workflow that builds `TrailBar.zip` on tag and attaches it to a Release.

**Files:**
- Create: `.github/workflows/menubar-release.yml`

**Step 1:** GH Actions on `macos-latest`, on `v*` tag push, runs `apps/menubar/scripts/build-app.sh`, zips the result, uploads to the release.

**Step 2:** Tag `v0.2.0`, verify zip lands on the release page.

**Step 3:** Commit + tag.

---

## Stop points

- **After Task 8** = working app installed locally + repo docs. Solid v0.2 milestone. STOP here.
- **Task 9** = distribution. Easier to do as its own session.

## What's NOT in this plan

- Apple Developer ID signing + notarization (= v1.0 launch, separate workstream once you decide to pay the $99/yr)
- Auto-launch on login (`SMAppService.mainApp.register()` — 5 min add when wanted)
- Custom app icon `.icns` (using SF Symbol for now)
- Login state UI (uses CLI `trail login` flow until needed)
- Settings panel (env vars suffice for v0.2)

## Realistic timeline

- Tasks 1–6: ~90 min (real Swift code, mostly tight)
- Task 7: ~30 min (bundle assembly + first-launch friction)
- Task 8: ~15 min (docs)
- **Total ~2.5 hours** in this session. I'll execute now and report each task.
