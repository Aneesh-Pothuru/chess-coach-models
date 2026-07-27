#!/usr/bin/env bash
set -eu

config_path="${1:-configs/config.yaml}"
python_bin="${PYTHON:-.venv/bin/python}"
data_url="$("$python_bin" -c 'import sys,yaml; print(yaml.safe_load(open(sys.argv[1]))["data"]["url"])' "$config_path")"

echo "Streaming ${data_url}"
# Deliberately omit pipefail: the filter exits at its configured caps, after which
# curl/zstd receive SIGPIPE. The Python command is the pipeline status we care about.
curl --fail --location --silent --show-error "$data_url" \
  | zstdcat \
  | "$python_bin" scripts/filter_stream.py --config "$config_path"

