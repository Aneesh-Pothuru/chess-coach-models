#!/usr/bin/env bash
# The reviewer authorized two heavy workers and literal rows only.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec nice -n 10 .venv/bin/python projects/rules-of-thumb/run_phase2.py "$@"
