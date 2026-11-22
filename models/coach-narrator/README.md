# Coach narrator

**The question.** Game Review already knows, from the engine and the app's board
code, why a move was a mistake and which line punishes it. When the better move
does not win at once but forces a reply that sets the tactic up ("this check
drags the king to g2, and then the knight forks king and queen"), can a small
language model say that line out loud, truthfully, in a way that teaches better
than today's text?

| | |
|---|---|
| **Reads** | The checked facts of one moment: the position, the move played, the better move, and the set-up line with each reply marked as forced by the rules or not. The facts come from Stockfish, Maia-2 and the app's board code, never from the model. |
| **Writes** | Two plain sentences that tell the line, added after Game Review's headline. |
| **Model** | Llama 3.2 3B Instruct with a LoRA adapter (rank 16 on the attention projections, about 9 million trained parameters). Built with Llama. |
| **Teacher** | Gemma 4 26B-A4B narrates the training set-ups; the student learns only from narrations that pass the truth filter. |
| **Trained on** | Set-ups from Lichess puzzles and rated Lichess games of October 2026 (CC0). |

## What is in this folder

| Folder | What it holds |
|---|---|
| [`review-writer/`](review-writer/) | The writer's plumbing: a game's facts through the app's own code (`facts.mjs`), prompts, the script that runs an open-weight writer (`write.py`), the fine-tune (`finetune.py`), the truth check (`truth.mjs`) and the blind judge (`judge.mjs`). Its README tells the first rounds, when the model wrote a whole explanation. |
| [`coach-eval/`](coach-eval/) | The coaching task: the rule a text is held to, the facts of a set-up line, the narration prompts, the filter that builds the training set (`narrate_sft.py`), the checks and the claim audit. [`coach-eval/results/coaching.md`](coach-eval/results/coaching.md) is the report. |
| [`colab/`](colab/) | `open_prompts.py` copies a version's prompts for the upload, keeping only the set-ups from open data. `retrain.sh` is the whole training run on a Colab A100, from the uploaded prompts to a zip of the adapter. |

The scripts run on the app's own code through the bridge, so they need read
access to the app. Their per-moment files live under `private/review-writer/`
and `private/coach-eval/`, which git ignores; what is committed is code and
aggregates.

## What it has shown

Narration version 6 was scored on a development set of 81 set-ups (10 from
games, 71 from puzzles), with the app pinned at the commit the report names.
The report gives every number; in short, the fine-tuned narrator passed the
truth check on every set-up, the claim audit found no false or unsupported
claim, and a blind judge preferred today's text with the narration over
today's text alone, and over a code template's narration.

These are development numbers: the set-ups were read while the prompts and the
checks were built. The coaching rule's verdict needs a fresh sample, of game
moments above all, and that run has not been made.

## The weights

The adapter that produced those results was not kept. It was trained on a
rented GPU whose disk was deleted before the adapter was copied off, so the
weights behind `coach-eval/results/coaching.md` no longer exist. What survives
is everything needed to make them again: the prompts, the filter, the
fine-tune and its settings, and that run's 81 held-out narrations with their
checks.

A retrain is a new model, since the teacher's narrations are generated again,
and it is trained on open data only: `colab/open_prompts.py` leaves every
set-up that comes from a course puzzle on the owner's machine, and
`narrate_sft.py --open-only` drops any that reach the filter, so the published
weights have seen Lichess positions and nothing else. It is checked on the
held-out set-ups that come from open data before it is published, and this
card will then give its name, its hash, its scores and where to download it.

## Training it

On the owner's machine, the narration prompts of a version are built from the
facts (`coach-eval/coach-prompts.mjs`), and the ones from open data are copied
for the upload:

```bash
python models/coach-narrator/colab/open_prompts.py n6 --out private/coach-narrator/upload-n6
```

On a Colab A100, with this repository cloned and those five files uploaded:

```bash
bash chess-coach-models/models/coach-narrator/colab/retrain.sh n6
```

The script has the teacher narrate the training set-ups, builds the training
set from the narrations that pass, fine-tunes
(2 epochs, learning rate 2e-4, batch 8 with 2 accumulation steps, cosine
schedule, seed 0), writes the student's narrations of the held-out set-ups and
zips the adapter with its logs. The last run took about 25 minutes.

Back on the owner's machine, `coach-eval/coach-check.mjs` runs the truth check
on the held-out narrations, `coach-eval/coach-rubric.mjs` the claim audit and
`review-writer/judge.mjs` the blind judge. The audit and the judge call a
model, so they are run on a budget agreed first.

## Licence

The base model is Llama 3.2 3B Instruct, under the
[Llama 3.2 Community License](https://www.llama.com/llama3_2/license/). An
adapter trained from it is published under the same licence, with a name that
starts with "Llama" and with the licence text beside it.
