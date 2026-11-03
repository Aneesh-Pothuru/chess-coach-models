#!/usr/bin/env bash
# One writer run on one case: a fresh copy of the case's checkout, the daily
# routine's own prompt at the case's code behind the review rehearsal preamble,
# a headless Claude Code session with the routine's model, no effort override
# and the study lessons' MCP server, and everything it leaves.
#   run-writer.sh <case-dir> <run-dir> [model]
set -euo pipefail
CASE="$1"; RUN="$2"; MODEL="${3:-claude-opus-5-5}"
BIN="$(cd "$(dirname "$0")" && pwd)"
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $BIN/offline.cjs"
ID=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$CASE/meta/case.json")
rm -rf "$RUN"
mkdir -p "$RUN"
cp -a "$CASE/repo" "$RUN/repo"
BASE=$(git -C "$RUN/repo" rev-parse HEAD)
PROMPT_FILE="$RUN/repo/docs/routines/daily.md"
{
  sed "s/{ID}/$ID/g" "$BIN/preamble-review.md"
  echo
  cat "$PROMPT_FILE"
} > "$RUN/task.md"
start=$(date +%s)
set +e
# A private /tmp, as the routine has in its own container: concurrent writers name
# their scratch files alike. The eval directory, under /tmp, is bound back in.
export EVAL_ROOT="${EVAL_ROOT:-/tmp/lesson-videos}"
: "${CHESS_MCP_URL:?set CHESS_MCP_URL to the address of the study lessons MCP server}"
export EVAL_MCP_CONFIG="{\"mcpServers\":{\"chess\":{\"type\":\"http\",\"url\":\"$CHESS_MCP_URL\"}}}"
timeout "${WRITER_TIMEOUT:-7200}" unshare -m --propagation private bash -c '
  set -e
  mkdir -p /run/eval-real-tmp
  mount --bind /tmp /run/eval-real-tmp
  mount -t tmpfs -o mode=1777 tmpfs /tmp
  mkdir -p "$EVAL_ROOT"
  mount --bind "/run/eval-real-tmp${EVAL_ROOT#/tmp}" "$EVAL_ROOT"
  exec "$@"
' bash "$BIN/claude-clean.sh" "$RUN/repo" --model "$MODEL" --output-format stream-json --verbose \
  --permission-mode acceptEdits --allowedTools "Bash Read Edit Write Glob Grep Agent Task TodoWrite TaskCreate TaskUpdate TaskList TaskGet mcp__chess" \
  < "$RUN/task.md" > "$RUN/stream.jsonl" 2> "$RUN/stderr.txt"
code=$?
set -e
end=$(date +%s)
cd "$RUN/repo"
git add -A
git diff --cached --stat "$BASE" > "$RUN/changes.txt"
git diff --cached --name-status "$BASE" > "$RUN/changed-files.txt"
git diff --cached --name-only "$BASE" -- coach-log public/coach | while read -r f; do
  if [ -f "$f" ]; then mkdir -p "$RUN/out/$(dirname "$f")"; cp "$f" "$RUN/out/$f"; fi
done
git reset -q
mkdir -p "$RUN/out"
set +e
npm run --silent coach -- daily check --date "$ID" > "$RUN/final-check.json" 2> "$RUN/final-check.err"
fc=$?
set -e
cat > "$RUN/run.json" <<JSON
{ "id": "$ID", "kind": "daily", "model": "$MODEL", "prompt": "$PROMPT_FILE", "exit": $code, "seconds": $((end - start)), "finalCheckExit": $fc, "base": "$BASE", "started": $start }
JSON
echo "run $RUN: exit $code in $((end - start))s, final check exit $fc"
