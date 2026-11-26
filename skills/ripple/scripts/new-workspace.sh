#!/usr/bin/env bash
# Create or refresh a Ripple Map workspace: ~/ripple/<company-id>/ (app code from the skill, data kept).
# Usage: new-workspace.sh <company-id> [--example]   --example seeds it with a finished sample from examples/ (if present)
set -euo pipefail
ID="${1:-}"
[[ "$ID" =~ ^[a-z0-9-]+$ ]] || { echo "usage: new-workspace.sh <kebab-company-id> [--example]" >&2; exit 1; }
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
WS="${RIPPLE_HOME:-$HOME/ripple}/$ID"
mkdir -p "$WS/data/lanes" "$WS/public/logos"

# app code always comes fresh from the skill (so app fixes reach old workspaces); data/ and logos are never overwritten
rsync -a --delete "$SKILL/app/src/" "$WS/src/"
rsync -a --delete "$SKILL/app/scripts/" "$WS/scripts/"
cp "$SKILL/app/index.html" "$SKILL/app/vite.config.js" "$SKILL/app/package.json" "$WS/"
[ -f "$SKILL/app/package-lock.json" ] && cp "$SKILL/app/package-lock.json" "$WS/"
for f in thesis ripple metrics briefs domains verify logos; do
  [ -f "$WS/data/$f.json" ] || cp "$SKILL/app/data/$f.json" "$WS/data/$f.json"
done
EX="$SKILL/examples/$ID"; [ -d "$EX" ] || EX="$(ls -d "$SKILL"/examples/*/ 2>/dev/null | head -1)"
if [ "${2:-}" = "--example" ] && [ -n "$EX" ]; then
  cp -R "$EX/data/." "$WS/data/"
  [ -d "$EX/logos" ] && cp -R "$EX/logos/." "$WS/public/logos/"
fi
if [ ! -d "$WS/node_modules" ] || [ "$SKILL/app/package.json" -nt "$WS/node_modules" ]; then
  (cd "$WS" && npm ci --silent --no-audit --no-fund 2>/dev/null || npm install --silent --no-audit --no-fund) && touch "$WS/node_modules"
fi
echo "$WS"
