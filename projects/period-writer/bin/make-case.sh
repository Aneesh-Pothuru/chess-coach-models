#!/usr/bin/env bash
# Build one eval case: a checkout of the code under test with the coach data as
# main held it just before review ID landed, after `coach <kind> prepare`.
#   make-case.sh <ID> <case-dir> [code-ref]      ID is YYYY-Www (weekly) or YYYY-MM (monthly)
# Layout: <case-dir>/repo is the checkout the writer works in; <case-dir>/meta
# holds what the harness knows about the case (never visible to the writer).
#
# The data is main's from the landing commit's parent: the period's dailies (and,
# for a month, its weeklies) are all in it. Prepare then runs with the code under
# test, chess.com cut off except the player's monthly game archives (the
# aggregate's games the engine did not analyse; a past window's archive never
# changes), so the brief on disk is the one `coach digest` renders for the
# writer, with prepare's own mark. Where the period landed with a brief, that
# frozen brief is kept in meta. The published review is run through the current
# checker (the plumbing check), then removed, and the starting state is
# committed so the writer's changes are the only diff.
set -euo pipefail
ID="$1"; CASE="$2"; CODE="${3:-origin/main}"
REPO="${CHESS_DIR:-/home/user/chess}"
BIN="$(cd "$(dirname "$0")" && pwd)"
case "$ID" in
  [0-9][0-9][0-9][0-9]-W[0-9][0-9]) KIND=weekly ;;
  [0-9][0-9][0-9][0-9]-[0-9][0-9]) KIND=monthly ;;
  *) echo "not a week or month id: $ID" >&2; exit 2 ;;
esac
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $BIN/offline.cjs"
cd "$REPO"
CODE_SHA=$(git rev-parse "$CODE")
# The commit that landed ID: the oldest on main that adds its annotations, never a
# shallow boundary (a commit whose parents were not fetched "adds" every file).
L=$(git log --format=%H --diff-filter=A origin/main -- "coach-log/review-annotations/$ID.json" | while read -r c; do git rev-parse -q --verify "$c^1" >/dev/null && echo "$c"; done | tail -1)
[ -n "$L" ] || { echo "no landing commit adds coach-log/review-annotations/$ID.json" >&2; exit 1; }
P=$(git rev-parse "$L^1")
rm -rf "$CASE"
mkdir -p "$CASE/repo" "$CASE/meta"
META="$CASE/meta"
cd "$CASE/repo"
git init -q
git config user.name eval && git config user.email eval@localhost
echo "$REPO/.git/objects" > .git/objects/info/alternates
cp "$REPO/.git/shallow" .git/shallow 2>/dev/null || true
git -c advice.detachedHead=false checkout -q --detach "$CODE_SHA"
rm -rf coach-log public/coach progress
git checkout -q "$P" -- coach-log public/coach progress
git reset -q
ln -s "$REPO/node_modules" node_modules
for a in public/stockfish public/ort; do
  if [ -d "$REPO/$a" ] && [ ! -e "$a" ]; then ln -s "$REPO/$a" "$a"; fi
  echo "/$a" >> .git/info/exclude
done
start=$(date +%s)
set +e
EVAL_ARCHIVE=1 npm run --silent coach -- "$KIND" prepare --date "$ID" > "$META/prepare.json" 2> "$META/prepare.err"
PREP=$?
set -e
PREP_SECONDS=$(( $(date +%s) - start ))
FROZEN=false
if git -C "$REPO" cat-file -e "$L:coach-log/briefs/$ID.json" 2>/dev/null; then
  git -C "$REPO" show "$L:coach-log/briefs/$ID.json" > "$META/frozen-brief.json"
  FROZEN=true
fi
[ -f "coach-log/briefs/$ID.json" ] && cp "coach-log/briefs/$ID.json" "$META/regen-brief.json"
git add -A
git commit -q -m "eval case $ID: the coach data after prepare"
BASE=$(git rev-parse HEAD)
MARK="tools/coach-review/.cache/prepared/$ID.json"
[ -f "$MARK" ] && cp "$MARK" "$META/prepare-mark.json"
# The plumbing check: the published review through the current checker, against
# the regenerated brief the writer gets.
git checkout -q "$L" -- "coach-log/review-annotations/$ID.json"
git checkout -q "$L" -- "coach-log/review-annotations/$ID.video.json" 2>/dev/null || true
cp "coach-log/review-annotations/$ID.json" "$META/published-annotations.json"
[ -f "coach-log/review-annotations/$ID.video.json" ] && cp "coach-log/review-annotations/$ID.video.json" "$META/published-video.json"
set +e
npm run --silent coach -- "$KIND" check --date "$ID" > "$META/reference-check.json" 2> "$META/reference-check.err"
REF=$?
set -e
git reset -q --hard "$BASE"
git clean -qfd
[ -f "$META/prepare-mark.json" ] && cp "$META/prepare-mark.json" "$MARK"
set +e
node -e "
require('./tools/coach-review/lib/ts.cjs');
const p = require('./src/adapters/node/publishing/index.ts');
const r = p.preparedBrief(process.cwd(), '$ID');
if (!r.ok) { console.error(r.why); process.exit(1) }
" 2> "$META/prepared.err"
VOUCHED=$?
set -e
USABLE=$([ "$VOUCHED" -eq 0 ] && [ "$PREP" -eq 0 ] && echo true || echo false)
GAMES=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['record'].get('games'))" "coach-log/briefs/$ID.json" 2>/dev/null || echo null)
cat > "$META/case.json" <<JSON
{ "id": "$ID", "kind": "$KIND", "code": "$CODE_SHA", "landing": "$L", "parent": "$P", "base": "$BASE", "frozenBrief": $FROZEN, "games": $GAMES, "usable": $USABLE, "prepareExit": $PREP, "prepareSeconds": $PREP_SECONDS, "referenceCheckExit": $REF }
JSON
echo "case $ID ready at $CASE (usable $USABLE, prepare exit $PREP in ${PREP_SECONDS}s, games $GAMES, reference check exit $REF)"
