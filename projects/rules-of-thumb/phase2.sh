#!/usr/bin/env bash
# Run only after the reviewer has answered implementation-notes.md.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ "${1:-}" != --reviewed ]]; then
  echo 'The full scan waits for reviewer answers. After review: phase2.sh --reviewed' >&2
  exit 2
fi
for month in 2026-07 2026-08 2026-09; do
  nice -n 10 .venv/bin/python projects/rules-of-thumb/stream.py --run full --month "$month" --phase2-reviewed
  nice -n 10 bridge/run.sh projects/rules-of-thumb/positions.mjs --run full --month "$month" --pool 3 --phase2-reviewed
  nice -n 10 bridge/run.sh projects/rules-of-thumb/score.mjs --run full --month "$month" --pool 3 --phase2-reviewed
done
nice -n 10 .venv/bin/python projects/rules-of-thumb/analyze.py --run full --phase2-reviewed
