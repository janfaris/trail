# Trail menu bar (xbar plugin)

> **Prefer a real `.app`?** A native SwiftUI menu bar app is available at [`apps/menubar/`](../../apps/menubar/README.md). It shows the same data, ships as `TrailBar.app`, and doesn't need xbar.

A tiny macOS menu bar widget for Trail. Shows recent sessions, today's count,
and click-to-share actions — no Electron, no second app to maintain.

```
☷ Trail · 3
─────────────────
Today: 3 · Total: 545
─────────────────
Recent
  pricing market research…
    claude-code · 41 ev · 4h
      View locally
      Share this session
  vercel deploy fix…
    hermes · 23 ev · 6h
─────────────────
Open profile
Open Trail web
Search… / Start record / Refresh
```

## Install

1. Install [xbar](https://xbarapp.com):
   ```bash
   brew install --cask xbar
   open /Applications/xbar.app
   ```

2. Symlink (or copy) the plugin into xbar's plugins folder:
   ```bash
   mkdir -p ~/Library/Application\ Support/xbar/plugins
   ln -sf "$(pwd)/extras/xbar/trail.30s.sh" \
     ~/Library/Application\ Support/xbar/plugins/trail.30s.sh
   ```

3. xbar will auto-detect and load it. The `.30s.` suffix means it refreshes
   every 30 seconds — change to `.5m.` if you want it quieter.

## Configure

Override any of these in xbar's **Variables** panel (right-click the
menu icon → Open plugin → Variables):

| Variable | Default | Purpose |
|---|---|---|
| `TRAIL_BIN` | `~/.local/bin/trail` | path to the trail CLI |
| `TRAIL_DB` | `~/.trail/db.sqlite` | local Trail database |
| `TRAIL_HANDLE` | `jankarlo.faris` | your Trail handle (for share links) |
| `TRAIL_WEB` | `https://gettrail.vercel.app` | web base URL |
| `TRAIL_LIMIT` | `8` | how many recent sessions to show |

## Requirements

- macOS (xbar is mac-only)
- `sqlite3` (preinstalled on macOS)
- `trail` CLI installed (`pnpm --filter @trail/cli build && npm link` from repo)
