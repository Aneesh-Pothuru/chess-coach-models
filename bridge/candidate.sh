#!/usr/bin/env bash
# Prints the directory of a candidate: a copy of the pinned app with some of
# its files replaced, so an eval can measure a change before it is ported.
#
#   bridge/candidate.sh <name> <app path>=<file> [<app path>=<file> ...]
#   CHESS_DIR="$(bridge/candidate.sh v1 src/services/review/accuracy.ts=v1/accuracy.ts)" \
#     bridge/run.sh projects/accuracy-vs-chesscom/run-eval.mjs --variant v1
#
# The copy hard-links the pinned checkout, node_modules included, so it costs
# no disk, and each named file is replaced by a new file rather than written
# through its link, so the pinned checkout stays exactly as pinned. It is
# rebuilt on every call.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: bridge/candidate.sh <name> <app path>=<file> [<app path>=<file> ...]" >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="$1"
shift
if ! [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]; then
  echo "candidate name must be letters, digits, - and _" >&2
  exit 2
fi

app="$(env -u CHESS_DIR "$root/bridge/checkout.sh")"
dir="${CHESS_CACHE:-$root/.cache/chess}/candidates/$name"
rm -rf "$dir"
mkdir -p "$(dirname "$dir")"
cp -al "$app" "$dir"
# The app writes its engine and review caches in place; a candidate keeps its own.
rm -rf "$dir/tools/coach-review/.cache"

for spec in "$@"; do
  target="${spec%%=*}"
  file="${spec#*=}"
  if [ "$target" = "$spec" ] || [[ "$target" = /* ]] || [[ "/$target/" = */../* ]]; then
    echo "not <app path>=<file> with a relative app path: $spec" >&2
    exit 2
  fi
  if [ ! -f "$dir/$target" ]; then
    echo "the app has no file $target" >&2
    exit 2
  fi
  rm -f "$dir/$target"
  cp "$file" "$dir/$target"
done
printf '%s\n' "$dir"
