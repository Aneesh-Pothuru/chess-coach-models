# Which mistakes get punished at this level?

**The question.** An engine prices a mistake by what it costs against perfect
play, but at the player's level many mistakes cost nothing, because the reply
that punishes them is never found. Maia-2, the human-move model the app ships,
gives the probability that a player at a given rating plays each move. Can its
probability of the punishing reply be trusted on the player's own games,
before a review is built on it?

**The answer.** Yes, by the rule below, in both directions (the player's errors
and the opponents') and on both sets of replies. The review service prices
every error with these odds (the app's `src/services/review/punish.ts`). The
numbers are in the paper, [`paper/paper.pdf`](paper/paper.pdf), and the lab's
reproduction of them in [`results/reproduction.md`](results/reproduction.md).

## The events

Every error in the accuracy project's games: a move that gave away at least 5
points of the mover's winning chances against the engine's best move, read
from the routine-profile reviews. For each:

- the punishing reply: the engine's best move in the position after the
  error;
- E1: the reply played was exactly that move;
- E2: the reply played gave away at most 2 points (an equally good
  alternative counts);
- q: Maia-2's probability of the punishing reply at the replier's band (the
  replier's chess.com rapid rating, converted by the app's `defaultMaiaElo`).

Replies from the opening book are left out. The primary set keeps the replies
whose evidence the review's deeper pass verified; that pass checks errors
first, so the set is selected partly on the outcome, and every result is also
given on all non-book replies.

## The rule, fixed before any number was computed

Maia is trusted in a direction when q's Brier score for E1 beats both a
constant base rate and a logistic regression on the error's size alone (both
fitted leaving one game out), with the 95% interval of each difference below
zero over 1000 bootstrap draws of games; and no calibration bin of q with 15 or
more events has its mean q more than 0.10 outside the Wilson interval of the
share that was found. `analyze.mjs` applies it.

## Files

| File | What it does |
|---|---|
| `events.mts` | Finds the errors and their punishing replies in the routine evidence and runs Maia-2 on each through the app's Node engine service (its weights download on first use). |
| `analyze.mjs` | The rule over the events: Brier scores against the two baselines with a bootstrap over games, the calibration bins, and the areas under the ROC curve. |
| `reproduce.mjs` | Recomputes the analysis from the records' events and reports whether it matches theirs byte for byte (the paper refuses to build when it does not), then rebuilds the events on the lab's evidence and reruns the analysis beside the recorded verdicts. |
| `paper/` | The paper. |

## Running it

It reads the accuracy project's routine evidence, so that comes first:

```bash
make chess
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile routine
bridge/run.sh projects/maia-punish/reproduce.mjs
bridge/run.sh projects/maia-punish/paper/generate.mjs
```

The events name games, so they stay in `private/maia-punish/`;
`results/reproduction.{md,json}` hold aggregates only.
