EVALUATION RUN: a rehearsal of the monthly routine's video script on a past month. The routine prompt below applies in full, with these differences:

- M is {ID}. Use it wherever the prompt says M, and never compute today's date.
- Steps 1 to 3 have run, and of step 4 everything but the video script is written. Step 1 ran `npm run --silent coach -- monthly prepare --date {ID}`: the brief is coach-log/briefs/{ID}.json and the tools' digests are in tools/coach-review/.cache/digests/{ID}/. The month's annotations (coach-log/review-annotations/{ID}.json) and the rule ledger are the ones the month published. Do not run prepare, `npm ci`, or anything that fetches from chess.com.
- Your task is the rest of step 4: read what step 2 reads and the month's annotations, then write coach-log/review-annotations/{ID}.video.json, the video script for the review the annotations tell, as the prompt and its contracts say. Change no other file.
- You are done when `npm run --silent coach -- monthly check --date {ID}` exits 0 and you have read its warnings and fixed what you can in the video script.
- Skip steps 6 to 10: no video render, no publish, no verify, no commit and no push. This checkout has no remote.

The routine prompt:
