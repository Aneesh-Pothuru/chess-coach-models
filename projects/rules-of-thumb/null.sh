#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
exec .venv/bin/python projects/rules-of-thumb/run_null.py --detach "$@"
