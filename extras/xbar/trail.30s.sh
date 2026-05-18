#!/usr/bin/env bash
# <xbar.title>Trail</xbar.title>
# <xbar.version>v0.1.0</xbar.version>
# <xbar.author>Jan K. Faris García</xbar.author>
# <xbar.author.github>janfaris</xbar.author.github>
# <xbar.desc>Recent AI coding sessions from Trail. Click to share or open profile.</xbar.desc>
# <xbar.image>https://gettrail.vercel.app/opengraph-image</xbar.image>
# <xbar.dependencies>sqlite3,jq</xbar.dependencies>
# <xbar.abouturl>https://gettrail.vercel.app</xbar.abouturl>

# Config — override via env in xbar's "Variables" panel if you want
TRAIL_BIN="${TRAIL_BIN:-$HOME/.local/bin/trail}"
TRAIL_DB="${TRAIL_DB:-$HOME/.trail/db.sqlite}"
TRAIL_HANDLE="${TRAIL_HANDLE:-jankarlo.faris}"
TRAIL_WEB="${TRAIL_WEB:-https://gettrail.vercel.app}"
LIMIT="${TRAIL_LIMIT:-8}"

# ── Guards ───────────────────────────────────────────────────────────────────
if [ ! -x "$TRAIL_BIN" ]; then
  echo "Trail ⚠️"
  echo "---"
  echo "trail CLI not found at $TRAIL_BIN"
  echo "Install | href=https://github.com/janfaris/trail"
  exit 0
fi

if [ ! -f "$TRAIL_DB" ]; then
  echo "Trail ·"
  echo "---"
  echo "No sessions yet"
  echo "Start recording | bash='$TRAIL_BIN' param1=record terminal=true"
  exit 0
fi

# ── Counts ───────────────────────────────────────────────────────────────────
TODAY_ISO=$(date -u +%Y-%m-%d)
TODAY_COUNT=$(sqlite3 "$TRAIL_DB" "SELECT COUNT(*) FROM sessions WHERE started_at >= '${TODAY_ISO}T00:00:00.000Z'")
TOTAL_COUNT=$(sqlite3 "$TRAIL_DB" "SELECT COUNT(*) FROM sessions")

# ── Menubar title ────────────────────────────────────────────────────────────
if [ "$TODAY_COUNT" -gt 0 ]; then
  echo "☷ Trail · ${TODAY_COUNT}"
else
  echo "☷ Trail"
fi
echo "---"
echo "Today: ${TODAY_COUNT} · Total: ${TOTAL_COUNT} | size=11 color=#888888"
echo "---"

# ── Recent sessions ──────────────────────────────────────────────────────────
echo "Recent | size=11 color=#888888"

# Pull id|tool|started_at|share_slug|event_count|first_prompt(200ch)
# Use NULL-tolerant subquery for prompt; sqlite3 -separator for safety
sqlite3 -separator $'\x1f' "$TRAIL_DB" <<SQL | while IFS=$'\x1f' read -r id tool started share_slug events prompt; do
  SELECT
    s.id,
    s.tool,
    s.started_at,
    COALESCE(s.share_slug, ''),
    (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id),
    replace(replace(replace(COALESCE((
      SELECT json_extract(e.payload, '\$.text')
      FROM events e
      WHERE e.session_id = s.id AND e.kind = 'prompt'
      ORDER BY e.at ASC LIMIT 1
    ), s.summary, s.id), char(10), ' '), char(13), ' '), char(9), ' ')
  FROM sessions s
  ORDER BY s.started_at DESC
  LIMIT ${LIMIT};
SQL
  # Trim title to 60 chars, single line
  title=$(echo "$prompt" | tr '\n' ' ' | tr -s ' ' | cut -c1-60)
  [ -z "$title" ] && title="$id"

  # Relative time
  if command -v gdate >/dev/null 2>&1; then
    ts=$(gdate -d "$started" +%s 2>/dev/null || echo 0)
  else
    ts=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${started%.*}" +%s 2>/dev/null || echo 0)
  fi
  now=$(date +%s)
  delta=$((now - ts))
  if [ "$ts" = "0" ]; then rel=""
  elif [ "$delta" -lt 3600 ]; then rel="$((delta / 60))m"
  elif [ "$delta" -lt 86400 ]; then rel="$((delta / 3600))h"
  else rel="$((delta / 86400))d"
  fi

  # Marker if already shared
  marker=""
  [ -n "$share_slug" ] && marker="↗ "

  # Top-level line: title · tool · events · age
  printf "%s%s | size=12 color=#e6e8eb\n" "$marker" "$title"
  printf "  %s · %s ev · %s | size=10 color=#888888\n" "$tool" "$events" "$rel"
  echo "--View locally | bash='$TRAIL_BIN' param1=view param2=$id terminal=true"
  if [ -n "$share_slug" ]; then
    echo "--Open share link | href=$TRAIL_WEB/u/$TRAIL_HANDLE/$share_slug"
    echo "--Copy share URL | bash=/bin/sh param1=-c param2=\"echo -n '$TRAIL_WEB/u/$TRAIL_HANDLE/$share_slug' | pbcopy\" terminal=false refresh=false"
  else
    echo "--Share this session | bash='$TRAIL_BIN' param1=share param2=$id param3=--yes param4=--copy param5=--base-url param6=$TRAIL_WEB terminal=true refresh=true"
  fi
done

echo "---"
echo "Open profile | href=$TRAIL_WEB/u/$TRAIL_HANDLE"
echo "Open Trail web | href=$TRAIL_WEB"
echo "---"
echo "Search… | bash='$TRAIL_BIN' param1=search terminal=true"
echo "Start record | bash='$TRAIL_BIN' param1=record terminal=true"
echo "Refresh | refresh=true"
