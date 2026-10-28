# The app's sounds

**The question.** Which sound should the app play at each moment of a game and a drill: his move
and theirs, a capture, a check, castling and promotion on either side, a right move in a puzzle
line, a solved puzzle, a wrong move, a hint, a finished set, a game's start, low time on his clock,
and a win, a loss or a draw? And what do listening models hear in each?

**The rule.** His ear decides. Every candidate is a recipe over the sound bank of
[earshot](https://github.com/Leonxlnx/earshot) (MIT, version 0.4.0, commit `591fa3e`): bank sounds
stored as code, mixed, pitched and levelled, plus three recorded sounds from its bank that are CC0
(a domino clack, a small bell and a fingertip tap on a book). Earshot's own listening models
(CLAP and AST) ranked each round's candidates against a description of the moment and against
named alternatives (a mouse click, a door knock, a synth blip); a candidate that read clearly as
something else was left out. He heard the rest on a listening page, each moment in turn and in a
demo game and puzzle, and picked one per moment. Their side plays the same sound a little lower
and softer (the pitch times 0.85 within the sound's range, a new seed, the untuned parts low-passed
at 3.5 kHz, 2 dB quieter) unless he picks another.

**The answer.** His nineteen picks are in [`chosen.json`](chosen.json), and the twenty-three
files the app ships (a right move climbs five notes, C5 D5 E5 G5 A5) in [`picks.json`](picks.json).
What the models said of each pick is in [`results/scores.json`](results/scores.json): they were a
guide, not the judge, and most of his board sounds are ones they could not place, while his checks
read strongly as a chess move rather than a doorbell or a notification.

## Files

| File | What it does |
|---|---|
| `candidates/spec*.json` | The three rounds' recipes, 190 in all (a ladder's five notes are five recipes). |
| `candidates/listen*.json` | The three rounds' listening scores: each candidate's calibrated z against the moment's description (strong at about 3 or more, plausible 2.5 to 3, weak 2 to 2.5) and its odds against the alternatives. |
| `chosen.json` | His pick for each moment, by candidate key, with the name the listening page gave it. |
| `collect.py` | Writes `picks.json` (one entry per shipped file, named for its moment, with its recipe) and `results/scores.json` (what the rounds said of each pick). |
| `render.py` | Renders `picks.json` with earshot's bank into 64 kbit/s mono MP3s and writes `results/render.json` (each file's length, size and SHA-256, and the earshot commit). |

## Running it

```bash
git clone https://github.com/Leonxlnx/earshot /tmp/earshot && git -C /tmp/earshot checkout 591fa3e
python3 projects/board-sounds/collect.py
python3 projects/board-sounds/render.py /tmp/earshot /tmp/board-sounds
```

`render.py` needs numpy, scipy and soundfile, and ffmpeg with libmp3lame. Rendering is
deterministic: the same earshot commit and ffmpeg give byte-identical files, so `results/render.json`'s hashes say
whether the app's files are these. It reads none of the player's data.
