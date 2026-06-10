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

if [[ -f "$COMMAND" ]] && grep -q "Installed by watchboard-ui skill" "$COMMAND" && grep -q "Source: $SKILL_DIR" "$COMMAND"; then
  rm -f "$COMMAND"
fi

for target in "${TARGETS[@]}"; do
  if [[ -L "$target" ]] && [[ "$(readlink "$target")" == "$SKILL_DIR" ]]; then
    rm -f "$target"
  fi
done

echo "Uninstalled watchboard-ui skill links and owned command wrapper."
