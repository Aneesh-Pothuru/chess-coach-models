#!/usr/bin/env python3
"""Packs a retrained narrator for a release and writes the record its card links.

retrain.sh's zip brings a retrain's adapter back from Colab, and the truth check
(coach-eval/coach-check.mjs) then reads its narrations of the held-out set-ups.
This reads both on the owner's machine and applies the card's publishing rule:
of the held-out set-ups from open data, at least 97% get a narration that
passes the check, and a set-up with no narration counts as a failure.

    python models/coach-narrator/weights/pack.py n6 --check private/coach-eval/coach-check-<name>.jsonl [...]

It writes beside this script <name>.json, the record (the weights' hash, the
training set's size, the check's counts), and <name>.md, the release's notes.
When the rule is met it also writes private/coach-narrator/release/<name>.zip:
the adapter with the Llama 3.2 licence, its notice and a README. The archive's
bytes depend only on those files, so the same adapter always packs to one hash.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import statistics
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB = HERE.parents[2]
RUN = LAB / "private" / "coach-narrator"
CARD = "https://github.com/Aneesh-Pothuru/chess-coach-models/tree/main/models/coach-narrator"
BAR_PERCENT = 97
BASE_FAMILY = "Llama-3.2-3B"
HELD_OUT = ("games", "puzzles")
WEIGHTS = "adapter_model.safetensors"
CONFIG = "adapter_config.json"
NOTICE = "Llama 3.2 is licensed under the Llama 3.2 Community License"

# A miss as the truth check words it, and what kind of miss it is without the
# move or the square it names.
KINDS = (
    (re.compile(r"^move .* is not in the facts$"), "a move the facts do not give"),
    (re.compile(r"^square .* is not in the facts$"), "a square the facts do not give"),
    (re.compile(r"^(?:number |\").* is not in the facts$"), "a number the facts do not give"),
    (re.compile(r"^no line the facts give starts with "), "a line from a move no line starts with"),
    (re.compile(r"^no .* stands on "), "a piece on a square where none stands"),
    (re.compile(r"^(?:your|their) .* is not on "), "a piece on a square it is not on"),
    (re.compile(r"^a reply called forced "), "a reply called forced that the rules do not force"),
    (re.compile(r" placed at "), "a tactic given to the wrong move"),
    (re.compile(r"the facts do not name$"), "a tactic or a mate the facts do not name"),
)


def name_of(version: str) -> str:
    """The model's name, as retrain.sh gives it: the licence asks that it start with Llama."""
    return f"{BASE_FAMILY}-coach-narrator-{version}"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def kind_of(miss: str) -> str:
    for shape, kind in KINDS:
        if shape.search(miss):
            return kind
    return "another miss"


def truth(held_out: dict[str, list[str]], rows: list[dict]) -> dict:
    """The check's counts over the held-out set-ups of each source. A missing or empty narration is a failure."""
    set_ups = [moment for moments in held_out.values() for moment in moments]
    if not set_ups:
        raise ValueError("no held-out set-ups were given, so there is nothing to hold the model to")
    closed = [moment for moment in set_ups if moment.startswith("course:")]
    if closed:
        raise ValueError(f"{len(closed)} held-out set-ups come from a course: a published model is checked on open data")
    known, by_id = set(set_ups), {}
    for row in rows:
        if row["id"] not in known:
            raise ValueError("the check read a set-up that is not among the held-out prompts")
        if row["id"] in by_id:
            raise ValueError("the check read two narrations of one set-up")
        by_id[row["id"]] = row
    written = [by_id[moment] for moment in set_ups if moment in by_id and by_id[moment]["words"] > 0]
    passed = {row["id"] for row in written if row["pass"]}
    misses = collections.Counter(kind_of(miss) for row in written for miss in row["misses"])
    return {
        "set_ups": len(set_ups),
        "narrations": len(written),
        "passed": len(passed),
        "pass_rate": round(len(passed) / len(set_ups), 4),
        "bar": BAR_PERCENT / 100,
        "by_source": {
            source: {"set_ups": len(moments), "passed": sum(1 for moment in moments if moment in passed)}
            for source, moments in held_out.items()
        },
        "median_words": statistics.median(row["words"] for row in written) if written else None,
        "misses": dict(sorted(misses.items())),
    }


def meets_rule(counts: dict) -> bool:
    return 100 * counts["passed"] >= BAR_PERCENT * counts["set_ups"]


def archive(path: Path, files: dict[str, bytes]) -> None:
    """A zip whose bytes depend only on its files' names and contents."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as out:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o644 << 16
            out.writestr(info, files[name])


def notes(record: dict) -> str:
    """The release's notes. Without the archive's own line they are the archive's README."""
    weights, counts, training = record["weights"], record["truth"], record["training"]
    rows = [
        ("Adapter", f"LoRA, rank {record['rank']} on the attention projections, for `{record['base']}`"),
        ("Weights", f"`{WEIGHTS}`, {weights['bytes']:,} bytes, sha256 `{weights['sha256']}`"),
        (
            "Trained on",
            f"{training['narrations']:,} narrations of set-ups from Lichess puzzles and games (CC0), "
            "written by a teacher model and kept only when they passed the training filter",
        ),
        (
            "Truth check",
            f"{counts['passed']} of {counts['set_ups']} held-out set-ups ({counts['pass_rate']:.1%}: "
            + ", ".join(f"{part['passed']} of {part['set_ups']} from {source}" for source, part in counts["by_source"].items())
            + f"); the rule for publishing asks {BAR_PERCENT}%",
        ),
        ("Median length", f"{counts['median_words']:g} words" if counts["median_words"] is not None else "no narration"),
    ]
    if record.get("archive"):
        packed = record["archive"]
        rows.append(("Archive", f"`{packed['file']}`, {packed['bytes']:,} bytes, sha256 `{packed['sha256']}`"))
    table = "\n".join(f"| {label} | {value} |" for label, value in rows)
    verdict = "" if record["meets_rule"] else (
        "\n**Not published.** The truth check's share is under the rule's bar, so these weights stay on the "
        "owner's machine.\n"
    )
    return f"""# {record['name']}

Built with Llama. An adapter that has Llama 3.2 3B Instruct tell a chess set-up
line out loud: two plain sentences, from facts an engine and board code have
already checked. The model card, with the prompts, the training and the
checks: {CARD}
{verdict}
| | |
|---|---|
{table}

The truth check holds every move, square, number and tactic a narration names
to the facts its prompt gave. The claim audit and the blind judge have not read
this model's narrations.

## Using it

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("{record['base']}")
model = PeftModel.from_pretrained(AutoModelForCausalLM.from_pretrained("{record['base']}"), "{record['name']}")
```

It answers the narration prompt that `coach-eval/coach-rewrite.mjs --task narrate`
writes from a moment's facts, and a narration is shown only when the truth
check passes it.

## Licence

{NOTICE}, Copyright © Meta Platforms, Inc. All Rights Reserved.
This adapter is a derivative work of Llama 3.2 and is distributed under that
licence: `LICENSE.txt` is its text and `Notice.txt` its notice. Its use must
follow Meta's Acceptable Use Policy, https://www.llama.com/llama3_2/use-policy.
"""


def pack(version: str, *, run: Path, prompts: Path, checks: list[Path], out: Path, records: Path) -> dict:
    name = name_of(version)
    adapter = run / name
    config = json.loads((adapter / CONFIG).read_text(encoding="utf-8"))
    base = config["base_model_name_or_path"]
    if BASE_FAMILY not in base:
        raise ValueError(f"the name says {BASE_FAMILY} and the adapter was trained on {base}")
    licence, notice = (HERE / "LICENSE.txt").read_bytes(), (HERE / "Notice.txt").read_bytes()
    if NOTICE.encode() not in notice:
        raise ValueError("Notice.txt does not carry the licence's notice")
    held_out = {
        source: [str(row["id"]) for row in read_jsonl(prompts / f"narrate-prompts-{source}-heldout-{version}.jsonl")]
        for source in HELD_OUT
    }
    # narrate_sft.py's counts are the last line retrain.sh kept of its output.
    filtered = json.loads((run / f"sft-{version}.json").read_text(encoding="utf-8").strip().splitlines()[-1])
    weights = adapter / WEIGHTS
    record = {
        "name": name,
        "base": base,
        "rank": config["r"],
        "weights": {"file": WEIGHTS, "bytes": weights.stat().st_size, "sha256": sha256_of(weights)},
        "training": {"narrations": filtered["rows"], "dropped": filtered["dropped"]},
        "truth": truth(held_out, [row for check in checks for row in read_jsonl(check)]),
        "archive": None,
    }
    record["meets_rule"] = meets_rule(record["truth"])
    packed = out / f"{name}.zip"
    packed.unlink(missing_ok=True)
    if record["meets_rule"]:
        archive(packed, {
            f"{name}/{WEIGHTS}": weights.read_bytes(),
            f"{name}/{CONFIG}": (adapter / CONFIG).read_bytes(),
            f"{name}/LICENSE.txt": licence,
            f"{name}/Notice.txt": notice,
            f"{name}/README.md": notes(record).encode(),
        })
        record["archive"] = {"file": packed.name, "bytes": packed.stat().st_size, "sha256": sha256_of(packed)}
    records.mkdir(parents=True, exist_ok=True)
    (records / f"{name}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    (records / f"{name}.md").write_text(notes(record), encoding="utf-8")
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("version", help="the prompt version, such as n6")
    parser.add_argument(
        "--check", type=Path, nargs="+", required=True,
        help="the truth check's rows for the held-out narrations, one file or more",
    )
    parser.add_argument("--run", type=Path, default=RUN, help="where retrain.sh's zip was unpacked")
    parser.add_argument("--prompts", type=Path, help="the uploaded prompts (default: <run>/upload-<version>)")
    parser.add_argument("--out", type=Path, help="where the archive goes (default: <run>/release)")
    parser.add_argument("--records", type=Path, default=HERE)
    args = parser.parse_args()
    record = pack(
        args.version,
        run=args.run,
        prompts=args.prompts or args.run / f"upload-{args.version}",
        checks=args.check,
        out=args.out or args.run / "release",
        records=args.records,
    )
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
