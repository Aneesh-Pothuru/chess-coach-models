#!/usr/bin/env bash
set -eu

config_path="${1:-configs/config.yaml}"
python_bin="${PYTHON:-.venv/bin/python}"
data_url="$("$python_bin" -c 'import sys,yaml; print(yaml.safe_load(open(sys.argv[1]))["concepts"]["puzzle_url"])' "$config_path")"

echo "Streaming ${data_url}"
# The sampler reads the whole CSV (it is small next to the game dumps), so
# pipefail is safe here, unlike the capped game streams.
set -o pipefail
curl --fail --location --silent --show-error "$data_url" \
  | zstdcat \
  | "$python_bin" scripts/build_concept_dataset.py --config "$config_path"
