#!/bin/bash
# Agent Watchboard - Uninstall Script

set -e

INSTALL_DIR="$HOME/.local/bin"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    local message=$2
    local color=""
    case $level in
        "INFO")  color=$BLUE ;;
        "ERROR") color=$RED ;;
        "SUCCESS") color=$GREEN ;;
    esac
    echo -e "${color}[$(date '+%H:%M:%S')] [$level] $message${NC}"
}

log "INFO" "Uninstalling Agent Watchboard CLIs..."

for cli in watchboard session_log; do
    if [[ -f "$INSTALL_DIR/$cli" ]]; then
        rm -f "$INSTALL_DIR/$cli"
        log "INFO" "Removed $INSTALL_DIR/$cli"
    fi
done

log "SUCCESS" "Agent Watchboard CLIs uninstalled."
echo ""
echo "Note: The project directory and node_modules are preserved."
