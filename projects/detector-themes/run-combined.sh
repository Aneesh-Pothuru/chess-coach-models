#!/usr/bin/env bash
# Verify the pre-score content freeze, then use the unchanged two-shard scorer.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
set_name="${1:?usage: run-combined.sh app|heldout}"
case "$set_name" in app|heldout) ;; *) exit 2;; esac
node projects/detector-themes/freeze-combined.mjs --bind-work
projects/detector-themes/run-score.sh "$set_name" best-deflection-trapped
node projects/detector-themes/freeze-combined.mjs --verify
