// The measured app's accuracy model (its ACCURACY_MODEL), rebuilt from a
// document's records with one hook per part a thesis may change: the cp ->
// win% curve, which plies count, the per-move curve, and the aggregation. Each
// part defaults to the review service's own (ctx.lib), so with no hooks it
// reproduces summarizeSide(...).accuracy exactly (check: the bench gives the
// same numbers as `--model current`). A thesis copies this file and overrides
// ONE hook. The Lichess-derived instrument the app first shipped is frozen in
// lichess-v2.mjs.

const MATE_CP_BASE = 10_000;

/** White-POV centipawns of a Score, mates collapsed as core/score does. */
export function cpOf(s) {
  if (s.mate !== null && s.mate !== undefined) return s.mate > 0 ? MATE_CP_BASE - s.mate * 10 : -MATE_CP_BASE - s.mate * 10;
  return s.cp;
}

/** Lichess's logistic, parameterised by its slope (lichess: 0.00368208). */
export const logisticWin = k => s => 50 + 50 * (2 / (1 + Math.exp(-k * cpOf(s))) - 1);

const exact = s => !!s && (s.cp !== null || s.mate !== null);

export function makeModel(hooks = {}) {
  return {
    accuracy(records, color, ctx) {
      const lib = ctx.lib;
      const graded = hooks.graded ?? (r => lib.graded(r));
      const moveAcc = hooks.moveAccuracy ?? (loss => lib.moveAccuracy(loss));
      const aggregate = hooks.aggregate ?? (pairs => lib.gameAccuracy(pairs.map(p => p.acc)));
      // The loss a move is scored on: the document's own unless a curve hook
      // recomputes it from the move's two scores.
      let lossOf = r => r.lossPct;
      if (hooks.win) {
        const win = hooks.win;
        lossOf = r => {
          if (!exact(r.before) || !exact(r.after)) return r.lossPct;
          const sign = r.mover === 'w' ? 1 : -1;
          return Math.max(0, 50 + sign * (win(r.before, r, ctx) - 50) - (50 + sign * (win(r.after, r, ctx) - 50)));
        };
      }
      const pairs = [];
      for (const r of records) {
        if (r.mover !== color || !graded(r, ctx)) continue;
        pairs.push({ acc: moveAcc(lossOf(r), r, ctx), weight: 1, record: r });
      }
      if (!pairs.length) return null;
      return aggregate(pairs, ctx);
    },
  };
}

export const { accuracy } = makeModel();
