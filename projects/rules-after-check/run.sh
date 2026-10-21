#!/bin/sh
set -eu
LAB=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec "$LAB/.venv/bin/python" "$LAB/projects/rules-after-check/run.py" --detach "$@"
