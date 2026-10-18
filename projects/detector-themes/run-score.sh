#!/usr/bin/env bash
# A resumable round-two score with at most two low-priority workers.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
set_name="${1:?usage: run-score.sh app|heldout [candidate]}"
case "$set_name" in app|heldout) ;; *) exit 2;; esac
if [ "$set_name" = heldout ]; then
  CHESS_DIR="$(env -u CHESS_DIR bridge/checkout.sh)" nice -n 10 .venv/bin/python projects/detector-themes/sample.py --round2 >&2
fi
if [ -n "${2:-}" ]; then
  export CANDIDATE="$2"
  export CHESS_DIR
  CHESS_DIR="$(projects/detector-themes/candidate.sh "$CANDIDATE")"
else
  unset CANDIDATE CHESS_DIR
fi
nice -n 10 bridge/run.sh projects/detector-themes/score.mts "$set_name" --round2 --shard 0/2 &
left=$!
nice -n 10 bridge/run.sh projects/detector-themes/score.mts "$set_name" --round2 --shard 1/2 &
right=$!
status=0
wait "$left" || status=1
wait "$right" || status=1
[ "$status" = 0 ] || exit "$status"
nice -n 10 bridge/run.sh projects/detector-themes/score.mts "$set_name" --round2 --merge 2
