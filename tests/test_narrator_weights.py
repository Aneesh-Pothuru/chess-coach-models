"""A retrained narrator is packed for a release only when it meets the card's publishing rule."""

import hashlib
import importlib.util
import json
import re
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "models" / "coach-narrator" / "weights" / "pack.py"
spec = importlib.util.spec_from_file_location("pack_weights", SCRIPT)
pack_weights = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack_weights)

NAME = "Llama-3.2-3B-coach-narrator-n9"
CARD = SCRIPT.parents[1] / "README.md"


def check_row(moment: str, *, passed: bool = True, words: int = 30, misses: tuple[str, ...] = ()) -> dict:
    return {"id": moment, "writer": "llama-3.2-3b+lora", "pass": passed, "misses": list(misses), "words": words}


def a_run(tmp_path: Path, rows: list[dict], *, set_ups: list[str] | None = None, base: str = "unsloth/Llama-3.2-3B-Instruct") -> dict:
    """A retrain as it sits on the owner's machine, and the arguments that pack it."""
    run = tmp_path / "run"
    adapter = run / NAME
    adapter.mkdir(parents=True)
    (adapter / "adapter_config.json").write_text(json.dumps({"base_model_name_or_path": base, "r": 16}))
    (adapter / "adapter_model.safetensors").write_bytes(b"weights" * 1000)
    (adapter / "README.md").write_text("a card the trainer wrote, which is not packed")
    (run / "sft-n9.json").write_text(json.dumps({"rows": 12, "dropped": {"names a move the facts do not give": 3}}) + "\n")
    ids = set_ups if set_ups is not None else [row["id"] for row in rows]
    prompts = run / "upload-n9"
    prompts.mkdir()
    games = [moment for moment in ids if not moment.startswith("lichess:")]
    puzzles = [moment for moment in ids if moment.startswith("lichess:")]
    for stem, kept in (("games-heldout", games), ("puzzles-heldout", puzzles)):
        (prompts / f"narrate-prompts-{stem}-n9.jsonl").write_text("".join(json.dumps({"id": moment}) + "\n" for moment in kept))
    checks = []
    for stem, kept in (("games", set(games)), ("puzzles", set(puzzles))):
        checks.append(tmp_path / f"coach-check-{stem}.jsonl")
        checks[-1].write_text("".join(json.dumps(row) + "\n" for row in rows if row["id"] in kept))
    return {"run": run, "prompts": prompts, "checks": checks, "out": tmp_path / "release", "records": tmp_path / "records"}


def set_up(index: int) -> str:
    return f"lichess:{index:05d}:0" if index % 2 else f"AbCd{index:04d}:3"


def test_a_narrator_that_meets_the_rule_is_packed_with_the_licence(tmp_path):
    rows = [check_row(set_up(i)) for i in range(40)]
    rows[0] = check_row(set_up(0), passed=False, misses=("move Qh5 is not in the facts",))
    paths = a_run(tmp_path, rows)
    record = pack_weights.pack("n9", **paths)

    assert record["meets_rule"] and record["truth"]["passed"] == 39 and record["truth"]["set_ups"] == 40
    assert record["truth"]["by_source"] == {"games": {"set_ups": 20, "passed": 19}, "puzzles": {"set_ups": 20, "passed": 20}}
    assert record["truth"]["misses"] == {"a move the facts do not give": 1}
    assert record["training"] == {"narrations": 12, "dropped": {"names a move the facts do not give": 3}}
    packed = paths["out"] / f"{NAME}.zip"
    assert record["archive"] == {
        "file": f"{NAME}.zip",
        "bytes": packed.stat().st_size,
        "sha256": hashlib.sha256(packed.read_bytes()).hexdigest(),
    }
    with zipfile.ZipFile(packed) as held:
        assert sorted(held.namelist()) == sorted(
            f"{NAME}/{name}" for name in ("LICENSE.txt", "Notice.txt", "README.md", "adapter_config.json", "adapter_model.safetensors")
        )
        assert held.read(f"{NAME}/LICENSE.txt") == (SCRIPT.parent / "LICENSE.txt").read_bytes()
        assert b"Llama 3.2 is licensed under the Llama 3.2 Community License" in held.read(f"{NAME}/Notice.txt")
        assert held.read(f"{NAME}/adapter_model.safetensors") == b"weights" * 1000
        readme = held.read(f"{NAME}/README.md").decode()
    assert "Built with Llama" in readme and "| Archive |" not in readme
    notes = (paths["records"] / f"{NAME}.md").read_text()
    assert f"sha256 `{record['archive']['sha256']}`" in notes
    assert "39 of 40 held-out set-ups (97.5%: 19 of 20 from games, 20 of 20 from puzzles); the rule" in notes
    assert json.loads((paths["records"] / f"{NAME}.json").read_text()) == record


def test_the_same_adapter_packs_to_the_same_bytes(tmp_path):
    rows = [check_row(set_up(i)) for i in range(4)]
    first = pack_weights.pack("n9", **a_run(tmp_path / "one", rows))
    second = pack_weights.pack("n9", **a_run(tmp_path / "two", rows))
    assert first["archive"]["sha256"] == second["archive"]["sha256"]


def test_under_the_bar_nothing_is_packed(tmp_path):
    rows = [check_row(set_up(i), passed=i >= 4, misses=() if i >= 4 else ("a fork piece the facts do not name",)) for i in range(100)]
    paths = a_run(tmp_path, rows)
    paths["out"].mkdir()
    (paths["out"] / f"{NAME}.zip").write_bytes(b"an archive from an earlier run")
    record = pack_weights.pack("n9", **paths)

    assert record["truth"]["pass_rate"] == 0.96 and not record["meets_rule"] and record["archive"] is None
    assert not (paths["out"] / f"{NAME}.zip").exists()
    assert "**Not published.**" in (paths["records"] / f"{NAME}.md").read_text()


def test_the_bar_is_met_at_exactly_97_in_100(tmp_path):
    rows = [check_row(set_up(i), passed=i >= 3) for i in range(100)]
    assert pack_weights.pack("n9", **a_run(tmp_path, rows))["meets_rule"]


def test_a_missing_or_empty_narration_is_a_failure():
    set_ups = [set_up(i) for i in range(4)]
    rows = [
        check_row(set_ups[0]),
        check_row(set_ups[1], words=0),
        check_row(
            set_ups[2],
            passed=False,
            misses=("square h7 is not in the facts", "a reply called forced that the facts do not force: Kg2"),
        ),
    ]
    counts = pack_weights.truth({"games": set_ups[0::2], "puzzles": set_ups[1::2]}, rows)
    assert counts["by_source"] == {"games": {"set_ups": 2, "passed": 1}, "puzzles": {"set_ups": 2, "passed": 0}}
    assert (counts["set_ups"], counts["narrations"], counts["passed"], counts["pass_rate"]) == (4, 2, 1, 0.25)
    assert counts["median_words"] == 30
    assert counts["misses"] == {
        "a reply called forced that the rules do not force": 1,
        "a square the facts do not give": 1,
    }
    assert not pack_weights.meets_rule(counts)


def test_the_check_must_be_of_the_held_out_set_ups_from_open_data():
    with pytest.raises(ValueError, match="not among the held-out prompts"):
        pack_weights.truth({"puzzles": [set_up(1)]}, [check_row(set_up(2))])
    with pytest.raises(ValueError, match="two narrations"):
        pack_weights.truth({"puzzles": [set_up(1)]}, [check_row(set_up(1)), check_row(set_up(1))])
    with pytest.raises(ValueError, match="come from a course"):
        pack_weights.truth({"puzzles": [set_up(1), "course:tactics:12:0"]}, [check_row(set_up(1))])
    with pytest.raises(ValueError, match="nothing to hold the model to"):
        pack_weights.truth({"games": [], "puzzles": []}, [])


def test_an_adapter_on_another_base_is_refused(tmp_path):
    paths = a_run(tmp_path, [check_row(set_up(1))], base="google/gemma-4-26B-A4B-it")
    with pytest.raises(ValueError, match="the adapter was trained on google/gemma"):
        pack_weights.pack("n9", **paths)


@pytest.mark.parametrize(
    ("miss", "kind"),
    [
        ("move Nf3+ is not in the facts", "a move the facts do not give"),
        ("square e4 is not in the facts", "a square the facts do not give"),
        ("number 3 is not in the facts", "a number the facts do not give"),
        ('"two" is not in the facts', "a number the facts do not give"),
        ("no line the facts give starts with Qh5", "a line from a move no line starts with"),
        ("no knight stands on f6", "a piece on a square where none stands"),
        ("their queen is not on d8", "a piece on a square it is not on"),
        ("a reply called forced that the facts do not force: Kg2, Kh1", "a reply called forced that the rules do not force"),
        ("a fork placed at Nd5: the facts give it to Nc7+", "a tactic given to the wrong move"),
        ("a mate the facts do not name", "a tactic or a mate the facts do not name"),
        ("a pin piece the facts do not name", "a tactic or a mate the facts do not name"),
        ("something the check may say later", "another miss"),
    ],
)
def test_a_miss_is_counted_by_its_kind_without_its_move(miss, kind):
    assert pack_weights.kind_of(miss) == kind


def test_the_card_names_each_published_retrain_by_its_records_hashes():
    card = CARD.read_text(encoding="utf-8")
    records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(SCRIPT.parent.glob("*.json"))]
    published = [record for record in records if record["archive"]]
    assert all(record["meets_rule"] for record in published)
    for record in published:
        assert f"releases/tag/{record['name']})" in card
    in_records = {record[part]["sha256"] for record in published for part in ("weights", "archive")}
    assert set(re.findall(r"\b[0-9a-f]{64}\b", card)) == in_records
