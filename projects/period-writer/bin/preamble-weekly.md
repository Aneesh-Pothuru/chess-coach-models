EVALUATION RUN: a rehearsal of the weekly routine on a past week. The routine prompt below applies in full, with these differences:

- W is {ID}. Use it wherever the prompt says W, and never compute today's date.
- Step 1 has already run and passed: `npm run --silent coach -- weekly prepare --date {ID}`. The brief is coach-log/briefs/{ID}.json and the tools' digests are in tools/coach-review/.cache/digests/{ID}/. Do not run prepare, `npm ci`, or anything that fetches from chess.com.
- Do steps 2 to 6 as written. You are done when `npm run --silent coach -- weekly check --date {ID}` exits 0 and you have read its warnings and fixed what you can.
- Skip steps 7 to 11: no video render, no publish, no verify, no commit and no push. This checkout has no remote.

The routine prompt:
