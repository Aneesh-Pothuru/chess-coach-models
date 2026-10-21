#!/usr/bin/env bash
# Prints the directory of the app commit this study measures (app-pin.json),
# fetching it and installing its packages the first time, as bridge/checkout.sh
# does for the lab's pin. Use it as CHESS_DIR="$(projects/tiebreak-rules/app.sh)".
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
read_pin() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$here/app-pin.json" "$1"; }
repo="$(read_pin repo)"
commit="$(read_pin commit)"
dir="${CHESS_CACHE:-$root/.cache/chess}/$commit"
if [ ! -f "$dir/.git/bridge-ready" ]; then
  tmp="$dir.partial"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  git -C "$tmp" init -q
  git -C "$tmp" remote add origin "$repo"
  git -C "$tmp" fetch -q --depth 1 origin "$commit"
  git -C "$tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD
  (cd "$tmp" && npm ci --no-audit --no-fund >&2)
  touch "$tmp/.git/bridge-ready"
  rm -rf "$dir"
  mv "$tmp" "$dir"
fi
printf '%s\n' "$dir"
