#!/bin/sh
set -eu
TIEBREAK_LAB=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec "$TIEBREAK_LAB/.venv/bin/python" -B "$TIEBREAK_LAB/projects/tiebreak-rules/run.py" --detach "$@"
