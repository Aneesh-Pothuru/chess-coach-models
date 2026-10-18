#!/usr/bin/env bash
# Build a round-two replacement copy through the lab bridge.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
name="${1:?usage: candidate.sh best-deflection|best-trapped}"
case "$name" in best-deflection|best-trapped) ;; *) echo "unknown candidate" >&2; exit 2;; esac
files="$root/projects/detector-themes/candidates/$name"
# The supplied .cache/chess may point to a shared cache; candidate writes stay here.
app="$(env -u CHESS_DIR "$root/bridge/checkout.sh")"
sha="$(git -C "$app" rev-parse HEAD)"
export CHESS_CACHE="$root/private/detector-themes/app-cache"
if [ ! -f "$CHESS_CACHE/$sha/.git/bridge-ready" ]; then
  rm -rf "$CHESS_CACHE/$sha.partial"
  mkdir -p "$CHESS_CACHE/$sha.partial"
  cp -al "$app/." "$CHESS_CACHE/$sha.partial/"
  mv "$CHESS_CACHE/$sha.partial" "$CHESS_CACHE/$sha"
fi
candidate="$("$root/bridge/candidate.sh" "detector-$name" \
  "src/services/knowledge/detectors/theme.ts=$files/theme.ts" \
  "src/services/knowledge/detectors/theme.test.ts=$files/theme.test.ts" \
  "src/services/knowledge/README.md=$files/knowledge-README.md" \
  "src/services/publishing/decks/mistakes.ts=$files/mistakes.ts")"
if [ -f "$files/mistakes.test.ts" ]; then
  cp "$files/mistakes.test.ts" "$candidate/src/services/publishing/decks/themeLine.test.ts"
fi
printf '%s\n' "$candidate"
