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
| [`coach-eval/`](coach-eval/) | The coaching task: the rule a text is held to, the facts of a set-up line, the narration prompts, the truth filter that builds the training set (`narrate_sft.py`, now matching `coach-check.mjs` across all 14 tactics, misplaced-tactic placement, omitted exchange costs, and unsupported piece gains), the checks (`coach-check.mjs`) and the claim audit. [`coach-eval/results/coaching.md`](coach-eval/results/coaching.md) is the report. |
| [`colab/`](colab/) | `open_prompts.py` copies a version's prompts for the upload, keeping only the set-ups from open data. `retrain.sh` runs the set-up narrator retrain on a Colab A100; `train_general.sh` runs the general PGN+FEN narrator (teacher generation, deterministic `narrator_sft.py` truth filtering, and LoRA fine-tuning). |
| [`corpus/`](corpus/) | The narrator's corpora, built on the owner's machine: strong players' moves in classical over-the-board games with their clocks, annotated positions under open licences (Wikibooks, Wikipedia, Chess Stack Exchange), Stockfish's lines, Maia-2's likely moves at several ratings, and the general PGN+FEN coaching pipeline: `narrator_prompts.py` (deterministic `python-chess` hanging-piece, forcedness, ply-linked tactic, and exchange-cost facts), `narrator_check.py` (deterministic truth checker), and `narrator_sft.py` (truth-filtered SFT builder preserving `source`, `licence`, and `attribution`). Its README says what each holds and which sources were left out. |
| [`weights/`](weights/) | `pack.py` holds a retrain to the publishing rule below, writes its record and its release notes here, and packs the adapter for a release with the Llama 3.2 licence (`LICENSE.txt`) and its notice (`Notice.txt`). |

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

**Published:** the release
[`Llama-3.2-3B-coach-narrator-n6`](https://github.com/Aneesh-Pothuru/chess-coach-models/releases/tag/Llama-3.2-3B-coach-narrator-n6)
of this repository. Its one file, `Llama-3.2-3B-coach-narrator-n6.zip`
(sha256 `51b593a3e188c7042020eb6dac78d5bdb47eb2db471e9468a2583f5804b09349`),
holds the adapter (`adapter_model.safetensors`, sha256
`079e7924b50a54e8263f6122f10a62b348c749ee10b78846eb1e245576d558fa`), its
config, the Llama 3.2 licence and its notice.
[`weights/Llama-3.2-3B-coach-narrator-n6.json`](weights/Llama-3.2-3B-coach-narrator-n6.json)
is its record and
[`weights/Llama-3.2-3B-coach-narrator-n6.md`](weights/Llama-3.2-3B-coach-narrator-n6.md)
the release's notes, with how to load it. `weights/pack.py` wrote both, and a
test holds the two hashes on this card to the record.

**It is a retrain, not the adapter behind the results above.** That adapter
was not kept: it was trained on a rented GPU whose disk was deleted before the
adapter was copied off, so the weights behind `coach-eval/results/coaching.md`
no longer exist. What survived was everything needed to make them again: the
prompts, the filter, the fine-tune and its settings, and that run's 81
held-out narrations with their checks.

A retrain is a new model, since the teacher's narrations are generated again,
and it is trained on open data only: `colab/open_prompts.py` leaves every
set-up that comes from a course puzzle on the owner's machine, and
`narrate_sft.py --open-only` drops any that reach the filter, so the published
weights have seen Lichess positions and nothing else.

**What the published retrain has passed** is the rule below and nothing more:
the truth check on the held-out set-ups from open data, with the counts in its
record. The claim audit and the blind judge have not read its narrations, so
"What it has shown" above is shown for the lost adapter and is still to be
shown for this one.

**The rule for publishing a retrain, written before its narrations were
read.** The retrained narrator writes the development set-ups that come from
open data (75 of version 6's 81: the 10 from games and 65 of the puzzles), and
the truth check (`coach-eval/coach-check.mjs`) holds each narration to the
facts its prompt gave. The weights are published when at least 97% of those
narrations pass, the bar of the coaching rule's first point
([`coach-eval/README.md`](coach-eval/README.md)); a set-up left without a
narration counts as a failure. Below the bar the weights stay unpublished and
this card says what failed. The claim audit and the blind judge call a model
and wait for an agreed budget, so a published retrain has passed the code's
check and nothing more until they run. [`weights/pack.py`](weights/pack.py)
applies the rule: it writes the retrain's record and release notes under
[`weights/`](weights/), with the weights' hash and the check's counts, and
packs the archive only when the rule is met.

## Training it

On the owner's machine, the narration prompts of a version are built from the
facts (`coach-eval/coach-rewrite.mjs --task narrate`), and the ones from open
data are copied for the upload:

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
zips the adapter with its logs. A run takes about 20 minutes of an A100.

Back on the owner's machine, `coach-eval/coach-check.mjs` runs the truth check
on the held-out narrations, and `weights/pack.py` reads its rows:

```bash
python models/coach-narrator/weights/pack.py n6 --check private/coach-eval/coach-check-<name>.jsonl
```

`coach-eval/coach-rubric.mjs` is the claim audit and `review-writer/judge.mjs`
the blind judge. They call a model, so they are run on a budget agreed first.

## Licence

The base model is Llama 3.2 3B Instruct, under the
[Llama 3.2 Community License](https://www.llama.com/llama3_2/license/). An
adapter trained from it is published under the same licence, with a name that
starts with "Llama" and with the licence text beside it.
