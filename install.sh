#!/usr/bin/env bash
# Ripple installer: copies the skill into ~/.claude/skills/ripple (Claude Code) and links it into
# Prime Agent's skills folder when Prime Agent is installed. Safe to re-run; keeps local workspaces.
# One-line install:  curl -fsSL https://raw.githubusercontent.com/robellephrm/ripple/main/install.sh | bash
set -euo pipefail
main() {
REPO="https://github.com/robellephrm/ripple.git"
DEST="$HOME/.claude/skills/ripple"
# use a local checkout only when this script is a real file in one (under curl | bash there is no file, so always clone)
SRC=""; [ -f "${BASH_SOURCE[0]:-}" ] && SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "${SRC:-}/skills/ripple/SKILL.md" ]; then
  command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git clone --quiet --depth 1 "$REPO" "$TMP/ripple"; SRC="$TMP/ripple"
fi
for c in node npm python3; do command -v "$c" >/dev/null 2>&1 || MISSING="${MISSING:-}$c "; done
if [ -n "${MISSING:-}" ]; then echo "missing: $MISSING(install Node.js 20+ and Python 3, then re-run)"; exit 1; fi

mkdir -p "$DEST"
# keep anything local (node_modules, the viewer's Electron download, your own examples) and update the rest
rsync -a --exclude node_modules "$SRC/skills/ripple/" "$DEST/"
chmod +x "$DEST"/scripts/*.sh
if [ -d "$HOME/.prime/agent" ] || command -v prime-agent >/dev/null 2>&1; then
  mkdir -p "$HOME/.prime/agent/skills" && ln -sfn "$DEST" "$HOME/.prime/agent/skills/ripple" && echo "linked into Prime Agent"
fi
echo "installed to $DEST"
echo "use it: in Claude Code or Prime Agent, type  /ripple path/to/memo.pdf"
echo "the first map you open downloads the app viewer once (Electron, about 270 MB)"
}
main "$@"
