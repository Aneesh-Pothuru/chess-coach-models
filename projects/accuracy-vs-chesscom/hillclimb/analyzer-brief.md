# Analyzer brief: accuracy vs chess.com

You are one researcher in a hill-climb on the Game Review's accuracy number.
The target is parity with chess.com's per-side accuracy on the player's games.
The lead investigator decides what is adopted; you test one thesis and report
evidence.

## What you may read

- The train split only: the ids in `_state.json` `train_ids`, their rows in
  `<variant>/results.jsonl` (handed to you as a train-only extract) and their
  traces `<variant>/traces/<id>_rep0.json`.
- The dev pool through the bench: `node --import tsx
  projects/accuracy-vs-chesscom/explore.mjs` (train + dev; it refuses test ids).
- The code under `src/` and the docs under `docs/`.

## What you must not do

- Never open a test-split trace or row, `gold.json` entries for test ids, or
  `coach-log/review-analysis/*.json` directly (it holds the test games' chess.com
  numbers). The bench reads the dev pool for you.
- Never edit files under `src/`. Write any alternative model as a module in your
  own scratch directory and score it with the bench (`--model <path>`).
- Never paste case content (a specific game, move or number) into a proposed
  rule. Describe the behaviour, not the instance.

## What a good answer looks like

- One thesis, stated as a mechanism ("chess.com counts opening book moves; we
  drop them, which lowers short games").
- Its effect on the bench, train and dev reported separately, overall and by
  length bucket, against `--model current`: MAE, bias, within-5, r.
- Which games it should hurt, and whether they were hurt.
- A proposed code change as a unified diff against the real source path,
  touching only what the thesis needs, plus a new `ACCURACY_MODEL` tag if the
  instrument changes. Prefer a structural change with a published rationale
  over a fitted constant. A constant fitted on train is suspect unless dev
  agrees.
- If the effect is smaller than about 0.5 points of MAE on dev, say so: it is
  inside the noise, and not worth a round.
