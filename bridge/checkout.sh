#!/usr/bin/env bash
# Prints the directory of a chess app checkout at a commit bridge/chess.json
# pins, fetching it the first time:
#
#   bridge/checkout.sh           the app every eval measures, with its npm
#                                dependencies, so evals import its TypeScript
#   bridge/checkout.sh records   the research records kept in the app's private
#                                repository (per-game cases, results, judge
#                                rounds), read at run time and never copied here
#
# CHESS_DIR (or CHESS_RECORDS_DIR), when set, wins: a candidate change is a
# patched copy of the pinned app, and an eval measures it by pointing CHESS_DIR
# at that copy.
set -euo pipefail

which="${1:-app}"
case "$which" in
  app) field=commit; override="${CHESS_DIR:-}" ;;
  records) field=records; override="${CHESS_RECORDS_DIR:-}" ;;
  *) echo "usage: bridge/checkout.sh [app|records]" >&2; exit 2 ;;
esac
if [ -n "$override" ]; then
  printf '%s\n' "$override"
  exit 0
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$root/bridge/chess.json"
read_pin() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$pin" "$1"; }
repo="$(read_pin repo)"
commit="$(read_pin "$field")"
dir="${CHESS_CACHE:-$root/.cache/chess}/$commit"

# The marker lives inside .git, so the checkout's own status stays clean.
if [ ! -f "$dir/.git/bridge-ready" ]; then
  tmp="$dir.partial"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  git -C "$tmp" init -q
  git -C "$tmp" remote add origin "$repo"
  # One commit and no history: the pin names exactly what is read.
  git -C "$tmp" fetch -q --depth 1 origin "$commit"
  git -C "$tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD
  if [ "$which" = app ]; then
    (cd "$tmp" && npm ci --no-audit --no-fund >&2)
  fi
  touch "$tmp/.git/bridge-ready"
  rm -rf "$dir"
  mv "$tmp" "$dir"
fi
printf '%s\n' "$dir"
