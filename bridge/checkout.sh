#!/usr/bin/env bash
# Prints the directory of the chess app at the commit bridge/chess.json pins,
# checking it out with its npm dependencies the first time. Evals import the
# app's own TypeScript from there, so they measure the code the app runs.
#
# CHESS_DIR, when set, wins: a candidate change is a patched copy of the
# pinned app, and an eval measures it by pointing CHESS_DIR at that copy.
set -euo pipefail

if [ -n "${CHESS_DIR:-}" ]; then
  printf '%s\n' "$CHESS_DIR"
  exit 0
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin="$root/bridge/chess.json"
field() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$pin" "$1"; }
repo="$(field repo)"
commit="$(field commit)"
dir="${CHESS_CACHE:-$root/.cache/chess}/$commit"

# The marker lives inside .git, so the checkout's own status stays clean.
if [ ! -f "$dir/.git/bridge-ready" ]; then
  tmp="$dir.partial"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  git -C "$tmp" init -q
  git -C "$tmp" remote add origin "$repo"
  # One commit and no history: the pin names exactly what is measured.
  git -C "$tmp" fetch -q --depth 1 origin "$commit"
  git -C "$tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD
  (cd "$tmp" && npm ci --no-audit --no-fund >&2)
  touch "$tmp/.git/bridge-ready"
  rm -rf "$dir"
  mv "$tmp" "$dir"
fi
printf '%s\n' "$dir"
