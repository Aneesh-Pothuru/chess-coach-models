#!/usr/bin/env bash
# Runs a research project's script against the chess app:
#
#   bridge/run.sh projects/<project>/<script>.mjs [args...]
#
# The script runs under the app's own tsx with CHESS_DIR set, so it can import
# the app's TypeScript through bridge/lib/chess.mjs, and packages by name from
# the app's node_modules.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHESS_DIR="$("$root/bridge/checkout.sh")"
export CHESS_DIR
# Packages a script imports by name resolve from the app (bridge/lib/app-packages.mjs).
exec "$CHESS_DIR/node_modules/.bin/tsx" --import "$root/bridge/lib/register.mjs" "$@"
