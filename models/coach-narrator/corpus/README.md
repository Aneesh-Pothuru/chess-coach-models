# The narrator's corpora

**What they are for.** A coach narrator is given a game (PGN) and a position (FEN) and says what is good
to do there, at the player's level. It may only say what checked facts hold: the engine's lines, the
board's features, what strong players chose in such positions, what a player at the level would likely
play instead. These corpora are those facts for a large number of positions, and, where people wrote
about a position under an open licence, their words, so a model can learn how a coach says such things.

Everything is built on the owner's machine under `data/corpus/`, which git ignores. What is committed is
the code and [`results/corpora.json`](results/corpora.json), the counts `corpus_summary.py` writes.

## The corpora

| Folder or file under `data/corpus/` | A row | Source | Licence | Script |
|---|---|---|---|---|
| `masters/games/` | a finished classical over-the-board game: event, both players (FIDE title, rating, FIDE id), result, time control, the moves with each move's clock, Lichess's evaluation and glyph | Lichess broadcast database, 2020-01 to 2026-10 | CC BY-SA 4.0 | `masters_corpus.py` |
| `masters/positions/` | a move a strong player made in one of those games: the position before it, the move, the mover and the opponent, both clocks, the seconds it took, Lichess's evaluation before and after it as winning chances, the result, the board's hand features | the same | CC BY-SA 4.0 | `masters_corpus.py` |
| `masters/explorer.parquet` | a move strong players chose in a position they reached at least five times, how often, by whom, and how it scored | built from `positions/` | CC BY-SA 4.0 | `masters_explorer.py` |
| `masters/sample.parquet` | a move of `positions/` chosen for the engine to read: ten minutes or more on the clock, plies 16 to 100, an undecided position, at most three a game, a fifth of them errors | built from `positions/` | CC BY-SA 4.0 | `masters_sample.py` |
| `annotated/openings.parquet` | a section of Wikibooks' *Chess Opening Theory* about the position its page is named for, with the reply the section discusses when it names one | en.wikibooks.org | CC BY-SA 4.0 | `wiki_fetch.py`, `openings_corpus.py` |
| `annotated/diagrams.parquet` | a chess diagram of a Wikipedia article on tactics, strategy, endgames, openings, traps, checkmates, famous games and world championship matches: the position, the line its caption gives, the caption and the paragraph after it | en.wikipedia.org | CC BY-SA 4.0 | `wiki_fetch.py`, `diagrams_corpus.py` |
| `annotated/games.parquet` | a move of a game Wikipedia annotates (famous games, world championship matches), with the commentary written after it: the position before and after it, the game's moves so far, the glyph | en.wikipedia.org | CC BY-SA 4.0 | `wiki_fetch.py`, `games_corpus.py` |
| `annotated/book-games-<id>.parquet` | a move of a game annotated in a public-domain book, with the author's note after it as printed (in the book's descriptive notation), the position before and after it and the game's moves so far as SAN: Capablanca's *Chess Fundamentals* (1921, his own games and examples) and Edward Lasker's *Chess Strategy* (1915) | Project Gutenberg (#33870, #5614) | public domain in the USA | `book_games_corpus.py`, `descriptive.py` |
| `annotated/stackexchange.parquet` | a Chess Stack Exchange question that shows a board, with its answers that scored a vote or were accepted | the site's data dump of 2024-04 (Internet Archive) | CC BY-SA 3.0 and 4.0 | `stackexchange_corpus.py` |
| `engine/<corpus>.parquet` | Stockfish's best lines for a corpus's positions, where the move discussed stands among them and what it gives away, and the lines of the other moves asked about | computed | — | `engine_lines.py` |
| `maia/<corpus>.parquet` | the published Maia-2's three likeliest moves at ratings 1100, 1350, 1700 and 2100, and its chance that the mover wins | computed | — | `maia_moves.py` |
| `coach-moments/moments.*` | every position above with its engine lines, Maia-2's moves and the hand features in one record, and the reference text when there is one | built from the rest | each row keeps its source's | `coach_moments.py` |
| `coach-moments/prompts.jsonl` | a moment's facts in words, as a prompt for a teacher model to narrate at the player's rating, with the reference text kept apart | built from `moments` | each row keeps its source's | `narrator_prompts.py` |
| `private/coach-narrator/concepts/` (under the lab's root, not `data/`) | the app's own lessons as concepts: each glossary term with its definition, each lesson board with its caption and explanation, each objective and takeaway | the app's repository, which is private | — | `concepts_corpus.py` |

A reference text is never a training target as it stands. People's words about a position name ideas worth
teaching, and they also say things no fact here holds: history, a judgment of their own, a line the engine
refutes (the engine's grade of the move a text discusses is in its row). The narrator is trained, as before
([`coach-eval/narrate_sft.py`](../coach-eval/narrate_sft.py)), on a teacher's narrations of the facts that
pass the truth check, and a reference may only suggest which idea the teacher names.

Every row of a text corpus names its page or question, the revision or answer it was read from, and its
licence, which is what attribution under CC BY-SA asks. A model trained on these texts, or a dataset made
from them, keeps that attribution, and a dataset that adapts them is shared under the same licence.

## Who counts as strong, and what counts as classical

- **Strong** (`data/broadcasts.py`): a mover with the title GM, IM, FM, CM, NM or WGM, or rated 2200 and up.
  The women's titles below WGM are given at lower ratings, so they count through the rating. The open
  title's world champions are marked by name, and the FIDE ids the names matched are in the manifest.
- **Classical**: the clocks of the first moves show at least 50 minutes, and the time control header, when
  it can be read, agrees; a broadcast whose name says rapid, blitz, Chess960 or the like never counts.
- **Time to think**: the mover had at least ten minutes on the clock before the move (`ample_clock`). The
  clock column keeps the time itself, so another bar is one filter away.
- **A game relayed twice** (an event in two broadcasts) is kept once, known by its players, its month and
  its moves.

The lab's own dataset of these moves, for a model that predicts what strong players play, is
`datasets/masters-classical.yaml` (`lab data masters-classical`): it reads the same files through the same
code and keeps the columns a position row of `game-positions` has.

## Sources looked at and left out

| Source | Why it is not used |
|---|---|
| The Week in Chess | "free for personal use only. All rights are reserved." No licence to reuse. |
| PGN Mentor | Free downloads with no licence stated. |
| Lichess studies | Their authors keep their rights (Lichess's terms); a study is open only when its author says so. |
| GameKnot's annotated games (the source of the published move-commentary datasets) | Collected from the site with no licence. |
| Paid course platforms (Chessable) | Their terms forbid copying or exporting course content and using it in any computer program. |
| chess.com | Its user agreement bars using its content to develop or train AI models or datasets. |
| Other public-domain books on Project Gutenberg | Usable but not read: Staunton's *Blue Book* writes moves in a notation older still ("Q. B. to K. R.'s 6th"), and the Morphy books and Edward Lasker's *Chess and Checkers* do not print games in rows. |

## Rebuilding

From the lab's root, with the broadcast files downloaded into `data/raw/lichess-broadcasts/` and the
Stack Exchange dump unpacked into `data/raw/stackexchange/chess/`:

```
cd models/coach-narrator/corpus
python masters_corpus.py --workers 12
python masters_explorer.py
python masters_sample.py ../../../data/corpus/masters/sample.parquet --positions 100000
python wiki_fetch.py --site en.wikibooks.org --prefix "Chess Opening Theory/" --out ../../../data/raw/wikimedia/wikibooks-opening-theory.jsonl
python wiki_fetch.py --site en.wikipedia.org --depth 1 --category "Chess tactics" ... --out ../../../data/raw/wikimedia/wikipedia-chess.jsonl
python openings_corpus.py ../../../data/raw/wikimedia/wikibooks-opening-theory.jsonl ../../../data/corpus/annotated/openings.parquet
python diagrams_corpus.py ../../../data/raw/wikimedia/wikipedia-chess.jsonl ../../../data/corpus/annotated/diagrams.parquet
python stackexchange_corpus.py ../../../data/raw/stackexchange/chess ../../../data/corpus/annotated/stackexchange.parquet
python book_games_corpus.py ../../../data/raw/gutenberg/33870-chess-fundamentals.txt ../../../data/corpus/annotated/book-games-33870.parquet --book-name "Chess Fundamentals (Capablanca, 1921)" --source https://www.gutenberg.org/ebooks/33870 --licence "Public domain in the USA (Project Gutenberg)"
python annotated_inputs.py ../../../data/corpus/inputs/annotated.parquet
python engine_lines.py <corpus>.parquet ../../../data/corpus/engine/<name>.parquet --nodes 400000 --multipv 4
python maia_moves.py <corpus>.parquet ../../../data/corpus/maia/<name>.parquet
python coach_moments.py
python corpus_summary.py
```

The engine reads each position with one thread, a fixed number of nodes and an empty hash, so the same
binary gives the same lines anywhere. Stockfish 19 at 400,000 nodes and four lines reads about ten
positions a second on a 16-thread desktop.
