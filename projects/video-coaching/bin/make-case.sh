#!/usr/bin/env bash
# Build one eval case: a checkout of the app at the code under test, with the
# coach data as main held it just before day D landed, D's prepare run again
# from its archived analysis, and the day's published writing put back in
# place except the video script, which is what a writer run writes.
#   make-case.sh <D> <case-dir> [code-ref]
# Layout: <case-dir>/repo is the checkout the writer works in; <case-dir>/meta
# holds what the harness knows about the case (never visible to the writer).
#
# The data is main's from the landing commit's parent, plus D's archived
# analysis. `coach daily prepare --from-archive` regenerates what prepare makes
# with the code under test (chess.com cut off, so the level falls back to the
# synced profile of the time) and leaves its mark, so the brief on disk is the
# one `coach digest daily` renders. analyze.cjs's digest is printed from the
# archived rows with each side's accuracy read by the code under test, as the
# brief reads it. Then the day's annotations, coach log, briefing and notes
# replies as they landed go back in place, and the published video script is
# run through the checker with them (the plumbing check): a case is usable only
# when the day's own files pass the code under test, so a writer's failures
# are its video script's. The video script is then removed and the starting
# state committed, so the writer's changes are the only diff.
set -euo pipefail
D="$1"; CASE="$2"; CODE="${3:-$(python3 -c "import json;print(json.load(open('$(dirname "$0")/../../../bridge/chess.json'))['commit'])")}"
REPO="${CHESS_DIR:-/home/user/chess}"
BIN="$(cd "$(dirname "$0")" && pwd)"
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $BIN/offline.cjs"
cd "$REPO"
CODE_SHA=$(git rev-parse "$CODE")
L=$(git log --format=%H --diff-filter=A origin/main -- "coach-log/review-annotations/$D.video.json" | while read -r c; do git rev-parse -q --verify "$c^1" >/dev/null && echo "$c"; done | tail -1)
[ -n "$L" ] || { echo "no landing commit adds coach-log/review-annotations/$D.video.json" >&2; exit 1; }
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
git checkout -q "$L" -- "coach-log/review-analysis/$D.json"
git reset -q
ln -s "$REPO/node_modules" node_modules
for a in public/stockfish public/ort; do
  if [ -d "$REPO/$a" ] && [ ! -e "$a" ]; then ln -s "$REPO/$a" "$a"; fi
  echo "/$a" >> .git/info/exclude
done
mkdir -p tools/coach-review/.cache
cp "coach-log/review-analysis/$D.json" tools/coach-review/.cache/analysis.json
start=$(date +%s)
set +e
npm run --silent coach -- daily prepare --date "$D" --from-archive > "$META/prepare.json" 2> "$META/prepare.err"
PREP=$?
set -e
PREP_SECONDS=$(( $(date +%s) - start ))
mkdir -p "tools/coach-review/.cache/digests/$D"
node "$BIN/digest-today.cjs" "$PWD" "$D" > "tools/coach-review/.cache/digests/$D/analyze.txt" 2> "$META/digest-today.err"
git show "$L:coach-log/briefs/$D.json" > "$META/frozen-brief.json" 2>/dev/null || true
[ -f "coach-log/briefs/$D.json" ] && cp "coach-log/briefs/$D.json" "$META/regen-brief.json"
# The day's writing as it landed, but the video script.
PUBLISHED=("coach-log/review-annotations/$D.json" "coach-log/$D.md" public/coach/briefing.json public/coach/notes-reply.json)
for f in "${PUBLISHED[@]}"; do
  git checkout -q "$L" -- "$f" 2>/dev/null || echo "not in the landing commit: $f" >> "$META/published-missing.txt"
done
git show "$L:coach-log/review-annotations/$D.video.json" > "$META/published-video.json"
git add -A
git commit -q -m "eval case $D: the coach data after prepare, and the day's writing but its video script"
BASE=$(git rev-parse HEAD)
MARK="tools/coach-review/.cache/prepared/$D.json"
cp "$MARK" "$META/prepare-mark.json" 2>/dev/null || true
# The plumbing check: the day's own files, the published video script with
# them, through the code under test's checker against the regenerated brief.
cp "$META/published-video.json" "coach-log/review-annotations/$D.video.json"
set +e
npm run --silent coach -- daily check --date "$D" > "$META/reference-check.json" 2> "$META/reference-check.err"
REF=$?
set -e
git reset -q --hard "$BASE"
git clean -qfd
[ -f "$META/prepare-mark.json" ] && cp "$META/prepare-mark.json" "$MARK"
set +e
node -e "
require('./tools/coach-review/lib/ts.cjs');
const p = require('./src/adapters/node/publishing/index.ts');
const r = p.preparedBrief(process.cwd(), '$D');
if (!r.ok) { console.error(r.why); process.exit(1) }
" 2> "$META/prepared.err"
VOUCHED=$?
set -e
USABLE=$([ "$VOUCHED" -eq 0 ] && [ "$PREP" -eq 0 ] && [ "$REF" -eq 0 ] && echo true || echo false)
GAMES=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['record'].get('games'))" "coach-log/briefs/$D.json" 2>/dev/null || echo null)
cat > "$META/case.json" <<JSON
{ "id": "$D", "kind": "daily", "code": "$CODE_SHA", "landing": "$L", "parent": "$P", "base": "$BASE", "games": $GAMES, "usable": $USABLE, "prepareExit": $PREP, "prepareSeconds": $PREP_SECONDS, "vouched": $([ "$VOUCHED" -eq 0 ] && echo true || echo false), "referenceCheckExit": $REF }
JSON
echo "case $D ready at $CASE (usable $USABLE, prepare exit $PREP in ${PREP_SECONDS}s, games $GAMES, reference check exit $REF)"
