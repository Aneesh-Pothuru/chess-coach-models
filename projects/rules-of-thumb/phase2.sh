#!/usr/bin/env bash
# The reviewer authorized the amended rule and two heavy workers.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec nice -n 10 .venv/bin/python projects/rules-of-thumb/run_phase2.py --detach "$@"
