#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ swift build -c release"
swift build -c release

BIN_PATH="$(swift build -c release --show-bin-path)"
APP="$(pwd)/.build/TrailBar.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN_PATH/TrailBar" "$APP/Contents/MacOS/TrailBar"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# Strip extended attributes that can cause Gatekeeper issues.
xattr -cr "$APP" || true

echo "✓ Built $APP"
