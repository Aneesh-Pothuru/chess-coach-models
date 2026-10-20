EVALUATION RUN: a rehearsal of the daily routine's video script on a past day. The routine prompt below applies in full, with these differences:

- D is {ID}. Use it wherever the prompt says D, and never compute today's date.
- Steps 1 to 3 have run, and of steps 4 and 5 everything but the video script is written. The brief is coach-log/briefs/{ID}.json and the tools' digests are in tools/coach-review/.cache/digests/{ID}/, analyze.cjs's included. The day's annotations (coach-log/review-annotations/{ID}.json), coach log (coach-log/{ID}.md), briefing (public/coach/briefing.json) and note replies are the ones the day published. Do not run prepare, `npm ci`, the optional Maia step, or anything that fetches from chess.com.
- Your task is the rest of step 4: read what step 2 reads and the day's annotations, then write coach-log/review-annotations/{ID}.video.json, the video script for the review the annotations tell, as the prompt and its contracts say. Change no other file.
- You are done when `npm run --silent coach -- daily check --date {ID}` exits 0 and you have read its warnings and fixed what you can in the video script.
- Skip steps 6 to 10: no video render, no publish, no verify, no commit and no push. This checkout has no remote.

The routine prompt:
