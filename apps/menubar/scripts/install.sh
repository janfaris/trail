#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/build-app.sh

APP=".build/TrailBar.app"
DEST="/Applications/TrailBar.app"

# Quit a running instance so we can overwrite it cleanly.
osascript -e 'tell application "TrailBar" to quit' >/dev/null 2>&1 || true
pkill -x TrailBar >/dev/null 2>&1 || true
sleep 1

rm -rf "$DEST"
cp -R "$APP" "$DEST"
xattr -cr "$DEST" || true

echo "✓ Installed $DEST"
open "$DEST"
