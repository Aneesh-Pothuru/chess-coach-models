EVALUATION RUN: a rehearsal of the daily routine's review on a past day. The routine prompt below applies in full, with these differences:

- D is {ID}. Use it wherever the prompt says D, and never compute today's date.
- Step 1 has run: the brief is coach-log/briefs/{ID}.json and the tools' digests are in tools/coach-review/.cache/digests/{ID}/, analyze.cjs's included. Do not run prepare, `npm ci`, the optional Maia step, or anything that fetches from chess.com. Step 3 is done: the day's open notes are answered. Of step 5, the day's coach log (coach-log/{ID}.md) and briefing (public/coach/briefing.json) are the ones the day published: leave them as they are.
- Your task is steps 2 and 4: read what step 2 reads, then write the day's review, coach-log/review-annotations/{ID}.json and coach-log/review-annotations/{ID}.video.json, as the prompt and its contracts say. The study lessons are read through the chess tools (study_search, study_concept, study_lesson). Change no other file under coach-log/ or public/coach/, except what `coach review teach --write` records on the day's archive.
- You are done when `npm run --silent coach -- daily check --date {ID}` exits 0 and you have read its warnings and fixed what you can in the review.
- Skip steps 6 to 10: no video render, no publish, no verify, no commit and no push. This checkout has no remote.

The routine prompt:
