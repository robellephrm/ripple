#!/usr/bin/env bash
# Build a Ripple workspace and open it in its own app window (no localhost, no browser tab).
# Usage: open-app.sh <workspace dir | company-id>
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
ARG="${1:?usage: open-app.sh <workspace dir | company-id>}"
if [ -d "$ARG" ]; then WS="$(cd "$ARG" && pwd)"
elif [[ "$ARG" =~ ^[a-z0-9-]+$ ]]; then WS="${RIPPLE_HOME:-$HOME/ripple}/$ARG"
else echo "not a workspace folder or a kebab-case company id: $ARG" >&2; exit 1; fi
[ -f "$WS/data/thesis.json" ] || { echo "no Ripple workspace at $WS" >&2; exit 1; }

V="$SKILL/viewer"
if [ ! -x "$V/node_modules/.bin/electron" ]; then
  echo "first run: installing the Ripple app viewer (one time)..."
  (cd "$V" && npm install --no-audit --no-fund --silent)
fi

# fresh build from the current data (about a second)
(cd "$WS" && npx --no-install vite build --logLevel error --emptyOutDir) || { echo "build failed" >&2; exit 1; }

NAME="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['company']['name'])" "$WS/data/thesis.json" 2>/dev/null || basename "$WS")"
# one window per company: close an older window for this workspace before opening the new one
pkill -f "ripple-viewer-ws=$WS/dist" 2>/dev/null || true
nohup "$V/node_modules/.bin/electron" "$V" "$WS/dist" "--title=Ripple · $NAME" "--ripple-viewer-ws=$WS/dist" >/dev/null 2>&1 &
echo "opened Ripple · $NAME"
