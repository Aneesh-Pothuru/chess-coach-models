#!/usr/bin/env bash
# Only the reviewed acquisition routing differs from the registered sequence.
set -euo pipefail
test "${1:-}" = --phase2 || { echo 'usage: phase2-amended.sh --phase2' >&2; exit 2; }
cd "$(dirname "$0")/../.."
node projects/second-look-fresh/amendment.mjs prepare
exec bash private/second-look-fresh/phase2-amended-body.sh --phase2
