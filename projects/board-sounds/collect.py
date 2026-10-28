"""Writes picks.json and results/scores.json from the candidate rounds and the player's choices.

picks.json is what render.py renders: one entry per file the app ships, named for the moment it
plays at, with the recipe of the candidate chosen for that moment. results/scores.json keeps what
earshot's listening models said of each chosen candidate in the round that ranked it.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROUNDS = ["spec.json", "spec2.json", "spec3.json"]
SCORES = ["listen.json", "listen2.json", "listen3.json"]
RUNGS = 5

FILES = {
    "move": "move",
    "opp": "move-them",
    "capture": "capture",
    "capture_t": "capture-them",
    "check": "check",
    "check_t": "check-them",
    "castle": "castle",
    "castle_t": "castle-them",
    "promote": "promote",
    "step": "right",
    "solved": "solved",
    "wrong": "wrong",
    "hint": "hint",
    "done": "done",
    "start": "start",
    "low": "low-time",
    "win": "win",
    "loss": "loss",
    "draw": "draw",
}
LADDERS = {"step"}


def load(name: str) -> dict:
    return json.loads((HERE / "candidates" / name).read_text())


def recipes() -> dict:
    out: dict = {}
    for name in ROUNDS:
        for key, recipe in load(name).items():
            out[key] = recipe
    return out


def scores_of(key: str) -> list[dict]:
    found = []
    for name in SCORES:
        for moment, group in load(name).items():
            for row in group.get("rank", []):
                if row["k"] not in (key, f"{key}_0"):
                    continue
                forced = (group.get("forced") or {}).get(row["k"], {})
                found.append(
                    {
                        "round": name.removesuffix(".json"),
                        "asked_as": moment,
                        "query": group["query"],
                        "candidate": row["k"],
                        "z": row["z"],
                        "verdict": row["verdict"],
                        "sounds_like": row.get("like"),
                        "p_query": row.get("p_role", forced.get("p_role")),
                        "p_alternatives": row.get("alts", forced.get("alts")),
                    }
                )
    return found


def main() -> None:
    chosen = json.loads((HERE / "chosen.json").read_text())
    book = recipes()
    missing = sorted(set(FILES) ^ set(chosen))
    if missing:
        raise SystemExit(f"chosen.json and FILES disagree on {missing}")
    picks = []
    for moment, file in FILES.items():
        key, label = chosen[moment]["key"], chosen[moment]["label"]
        if moment in LADDERS:
            for rung in range(RUNGS):
                rk = f"{key}_{rung}"
                if rk not in book:
                    raise SystemExit(f"no recipe for {rk}")
                picks.append({"file": f"{file}-{rung + 1}", "moment": moment, "rung": rung + 1, "key": rk, "label": label, "recipe": book[rk]})
            continue
        if key not in book:
            raise SystemExit(f"no recipe for {key}")
        picks.append({"file": file, "moment": moment, "key": key, "label": label, "recipe": book[key]})
    (HERE / "picks.json").write_text(json.dumps(picks, indent=1) + "\n")
    scores = {moment: {"key": chosen[moment]["key"], "label": chosen[moment]["label"], "heard": scores_of(chosen[moment]["key"])} for moment in FILES}
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / "scores.json").write_text(json.dumps(scores, indent=1) + "\n")
    print(f"{len(picks)} files for {len(FILES)} moments")


if __name__ == "__main__":
    main()
