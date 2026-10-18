#!/usr/bin/env bash
# Only after phase one's design commit has been reviewed. Never commits/pushes.
set -euo pipefail
test "${1:-}" = --phase2 || { echo 'usage: phase2.sh --phase2' >&2; exit 2; }
cd "$(dirname "$0")/../.."
unset CHESS_DIR CHESS_RECORDS_DIR CHESS_CACHE
nice -n 10 bridge/run.sh projects/second-look-fresh/prepare.mjs
candidate_dir=$(node projects/second-look-fresh/candidate.mjs)
node projects/second-look-fresh/runtime.mjs baseline
node projects/second-look-fresh/runtime.mjs candidate

for arm in baseline candidate; do
  if [ "$arm" = candidate ]; then export CHESS_DIR="$candidate_dir"; else unset CHESS_DIR; fi
  for profile in phone desktop routine; do
    nice -n 10 bridge/run.sh projects/second-look-fresh/build.mjs --phase2 --variant "$arm" --profile "$profile"
  done
  for profile in phone desktop; do
    nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --all --phase2 --variant "$arm" --profile "$profile" --shard 0/2 &
    first_pid=$!
    nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --all --phase2 --variant "$arm" --profile "$profile" --shard 1/2 &
    second_pid=$!
    # Wait for both even if one fails; leave no engine job running on failure.
    failed=0
    wait "$first_pid" || failed=1
    wait "$second_pid" || failed=1
    test "$failed" = 0 || exit 1
  done
  nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --all --phase2 --variant "$arm" --profile routine
done
unset CHESS_DIR
nice -n 10 bridge/run.sh projects/second-look-fresh/reference.mjs --phase2 --shard 0/2 &
first_pid=$!
nice -n 10 bridge/run.sh projects/second-look-fresh/reference.mjs --phase2 --shard 1/2 &
second_pid=$!
failed=0
wait "$first_pid" || failed=1
wait "$second_pid" || failed=1
test "$failed" = 0 || exit 1
nice -n 10 bridge/run.sh projects/second-look-fresh/analyze.mjs --phase2
