#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${WATCHBOARD_UI_BIN_DIR:-$HOME/.local/bin}"
COMMAND="$BIN_DIR/watchboard-ui"
SKILL_NAME="watchboard-ui"
TARGETS=(
  "$HOME/.codex/skills/$SKILL_NAME"
  "$HOME/.claude/skills/$SKILL_NAME"
  "$HOME/.opencode/skills/$SKILL_NAME"
  "$HOME/.agents/skills/$SKILL_NAME"
)

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to install watchboard-ui" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
cat > "$COMMAND" <<EOF
#!/usr/bin/env bash
# Installed by watchboard-ui skill
# Source: $SKILL_DIR
exec node "$SKILL_DIR/bin/watchboard-ui.mjs" "\$@"
EOF
chmod +x "$COMMAND"

for target in "${TARGETS[@]}"; do
  mkdir -p "$(dirname "$target")"
  if [[ -L "$target" ]]; then
    rm -f "$target"
  elif [[ -e "$target" ]]; then
    echo "Skipping existing non-symlink skill path: $target" >&2
    continue
  fi
  ln -s "$SKILL_DIR" "$target"
done

echo "Installed watchboard-ui command at $COMMAND"
echo "Run: watchboard-ui doctor"
