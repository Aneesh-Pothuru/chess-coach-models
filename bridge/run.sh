#!/usr/bin/env bash
# Runs an eval against the chess app:
#
#   bridge/run.sh evals/<flow>/<script>.mts [args...]
#
# The script runs under the app's own tsx with CHESS_DIR set, so it can import
# the app's TypeScript through evals/lib/chess.mjs.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHESS_DIR="$("$root/bridge/checkout.sh")"
export CHESS_DIR
exec "$CHESS_DIR/node_modules/.bin/tsx" "$@"
