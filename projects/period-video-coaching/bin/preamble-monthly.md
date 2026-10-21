EVALUATION RUN: a rehearsal of the monthly routine on a past month. The routine prompt below applies in full, with these differences:

- M is {ID}. Use it wherever the prompt says M, and never compute today's date.
- Step 1 has already run and passed: `npm run --silent coach -- monthly prepare --date {ID}`. The brief is coach-log/briefs/{ID}.json and the tools' digests are in tools/coach-review/.cache/digests/{ID}/. Do not run prepare, `npm ci`, or anything that fetches from chess.com.
- Do steps 2 to 5 as written. You are done when `npm run --silent coach -- monthly check --date {ID}` exits 0 and you have read its warnings and fixed what you can.
- Skip steps 6 to 10: no video render, no publish, no verify, no commit and no push. This checkout has no remote.

The routine prompt:
