#!/usr/bin/env python3
"""Count paired players and export their games without reading any outcome.

Only the source stream's committed gzip bytes are read, so this can count a
durable prefix while streaming continues. Exports carry a source fingerprint.
Usernames and per-player rows stay under private/think-time-budget.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path

from stream import LAB, PRIVATE, atomic_json

PROJECT = LAB / "projects" / "think-time-budget"
PRIMARY_LO = 1100
PRIMARY_HI_EXCLUSIVE = 1600
K_VALUES = (2, 3, 5)
TARGET_PLAYERS = 2000
RETAIN_K2 = 0.8


class PrefixReader(io.RawIOBase):
    """An immutable byte prefix of a file whose writer may still append."""

    def __init__(self, path: Path, size: int):
        super().__init__()
        self.raw = path.open("rb")
        self.remaining = size

    def readable(self):
        return True

    def readinto(self, buffer):
        data = self.raw.read(min(len(buffer), self.remaining))
        if not data and self.remaining:
            raise EOFError("source is shorter than its committed checkpoint")
        buffer[:len(data)] = data
        self.remaining -= len(data)
        return len(data)

    def close(self):
        self.raw.close()
        super().close()


def records(month: str, size: int):
    with PrefixReader(PRIVATE / f"games-{month}.jsonl.gz", size) as raw:
        with gzip.GzipFile(fileobj=io.BufferedReader(raw)) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8") as text:
                for line in text:
                    if line.strip():
                        yield json.loads(line)


def player_id(name: str) -> str:
    return hashlib.sha256(name.casefold().encode()).hexdigest()[:24]


def empty_player() -> dict:
    return {"games": {"fast": 0, "slow": 0}, "ratingSum": 0, "months": {}}


def primary(player: dict) -> bool:
    return PRIMARY_LO <= player["meanRating"] < PRIMARY_HI_EXCLUSIVE


def qualifies(player: dict, k: int) -> bool:
    return min(player["games"].values()) >= k


def count_set(players: dict, k: int, month: str | None = None) -> dict:
    kept = []
    for player in players.values():
        counts = player["games"] if month is None else player["months"].get(month, {"fast": 0, "slow": 0})
        if min(counts.values()) >= k:
            kept.append(player)
    his = [player for player in kept if primary(player)]
    def games(player):
        return player["games"] if month is None else player["months"][month]
    return {
        "players": len(kept), "primaryPlayers": len(his),
        "playerGames": {budget: sum(games(player)[budget] for player in kept) for budget in ("fast", "slow")},
        "primaryPlayerGames": {budget: sum(games(player)[budget] for player in his) for budget in ("fast", "slow")},
    }


def prefix_hash(month: str, size: int) -> str:
    digest = hashlib.sha256()
    with (PRIVATE / f"games-{month}.jsonl.gz").open("rb") as source:
        remaining = size
        while remaining:
            data = source.read(min(1 << 20, remaining))
            if not data:
                raise EOFError("source shortened before fingerprint")
            digest.update(data)
            remaining -= len(data)
    return digest.hexdigest()


def export_games(snapshots: dict, players: dict, k: int, fingerprint: str) -> tuple[dict, dict]:
    exports = {}
    seen = set()
    controls = collections.defaultdict(collections.Counter)
    for month, state in snapshots.items():
        path = PRIVATE / f"eligible-{month}.jsonl.gz"
        tmp = path.with_name(path.name + ".partial")
        games = collections.Counter()
        with tmp.open("wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=5) as zipped:
                for game in records(month, state["outputBytes"]):
                    if game["id"] in seen:
                        continue
                    seen.add(game["id"])
                    white_id, black_id = player_id(game["white"]), player_id(game["black"])
                    white, black = players[white_id], players[black_id]
                    white_eligible, black_eligible = qualifies(white, k), qualifies(black, k)
                    if not white_eligible and not black_eligible:
                        continue
                    row = {**game,
                           "whitePlayer": white_id, "blackPlayer": black_id,
                           "whiteMeanRating": white["meanRating"], "blackMeanRating": black["meanRating"],
                           "whiteEligible": white_eligible, "blackEligible": black_eligible,
                           "whitePrimary": primary(white) and white_eligible,
                           "blackPrimary": primary(black) and black_eligible,
                           "cohortFingerprint": fingerprint}
                    zipped.write((json.dumps(row, separators=(",", ":")) + "\n").encode())
                    games[game["budget"]] += 1
                    if game["budget"] == "slow":
                        control = controls[game["tc"]]
                        control["games"] += 1
                        control["playerGames"] += white_eligible + black_eligible
                        control["primaryGames"] += bool(row["whitePrimary"] or row["blackPrimary"])
                        control["primaryPlayerGames"] += row["whitePrimary"] + row["blackPrimary"]
            raw.flush()
            os.fsync(raw.fileno())
        tmp.replace(path)
        exports[month] = {"games": dict(games), "bytes": path.stat().st_size, "sha256": prefix_hash_file(path)}
    totals = {key: sum(value[key] for value in controls.values())
              for key in ("games", "playerGames", "primaryGames", "primaryPlayerGames")}
    shares = {tc: {**{key: value[key] for key in totals},
                   **{f"{key}Share": value[key] / total if total else 0 for key, total in totals.items()}}
              for tc, value in sorted(controls.items())}
    return exports, shares


def prefix_hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def record_history(result: dict) -> None:
    path = PROJECT / "results" / "sampling-history.json"
    history = json.loads(path.read_text()) if path.exists() else {"schema": 1, "checkpoints": []}
    history["appCommit"] = result.get("appCommit") or json.loads((LAB / "bridge" / "chess.json").read_text())["commit"]
    entry = {
        "months": result["months"], "fingerprint": result["fingerprint"],
        "gamesRead": {m: s["counts"]["gamesRead"] for m, s in result["sources"].items()},
        "compressedOffset": {m: s["compressedOffset"] for m, s in result["sources"].items()},
        "sourceSha256": result["sourceSha256"], "byK": result["byK"], "selectedK": result["selectedK"],
    }
    if not any(old["fingerprint"] == entry["fingerprint"] for old in history["checkpoints"]):
        history["checkpoints"].append(entry)
    atomic_json(path, history)


def recover_history() -> None:
    """Recover early count-only checkpoints from this project's own run logs.

    Needed only for a run that began before history writing was added. The
    recorded gzip byte lengths still address immutable prefixes; their hashes
    are recomputed rather than inferred from a later cohort.
    """
    path = PROJECT / "results" / "sampling-history.json"
    log = PRIVATE / "sample.log"
    if path.exists() or not log.exists():
        return
    summaries = {}
    for source in PRIVATE.glob("stream-*.log"):
        for line in source.read_text().splitlines():
            try:
                value = json.loads(line)
            except ValueError:
                continue
            if "month" in value and "counts" in value:
                summaries[(value["month"], value["counts"]["gamesRead"])] = value
    previous = None
    for line in log.read_text().splitlines():
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if "byK" in value and "fingerprint" in value:
            previous = value
        elif "read" in value and previous:
            sources = {month: summaries.get((month, games)) for month, games in value["read"].items()}
            if not all(sources.values()):
                continue
            hashes = {month: prefix_hash(month, state["outputBytes"]) for month, state in sources.items()}
            record_history({**previous, "sources": sources, "sourceSha256": hashes})
            previous = None


def markdown(result: dict) -> str:
    out = ["# Paired-player counts", "", f"Written by `cohort.py` for the app at `{result['appCommit']}`. "
           "Only counts and source timings are read here; no error rate or effect is computed.", "",
           "The sources are file-order prefixes, ending at complete zstd frames. A complete flag means the whole archive was read.", "",
           "| Month | Source games read | Fast games kept | Slow games kept | Seconds | Complete |", "|---|---:|---:|---:|---:|---|"]
    for month, state in result["sources"].items():
        counts = state["counts"]
        out.append(f"| {month} | {counts['gamesRead']:,} | {counts['kept']['fast']:,} | {counts['kept']['slow']:,} | {state['seconds']:.1f} | {'yes' if state['complete'] else 'no'} |")
    out += ["", "A player's primary band is a mean kept-game rapid rating from 1100 inclusive to 1600 exclusive, over both budgets and all read months.", "",
            "| Minimum games in each budget | Paired players | Primary players | Primary fast player-games | Primary slow player-games |",
            "|---|---:|---:|---:|---:|"]
    for k, counts in result["byK"].items():
        out.append(f"| {k} | {counts['players']:,} | {counts['primaryPlayers']:,} | {counts['primaryPlayerGames']['fast']:,} | {counts['primaryPlayerGames']['slow']:,} |")
    out += ["", f"Chosen K: {result['selectedK']}. {result['selectionExplanation']}", "",
            f"Sampling status: {result['stopReason']}. Source fingerprint: `{result['fingerprint']}`.", "",
            "Counts within each month (primary status still uses the mean over every kept game):", "",
            "| Month | Minimum games each | Paired players | Primary players |", "|---|---:|---:|---:|"]
    for month, values in result["byMonthK"].items():
        for k, counts in values.items():
            out.append(f"| {month} | {k} | {counts['players']:,} | {counts['primaryPlayers']:,} |")
    out += ["", "Slow time controls among all kept games:", "", "| Time control | Games | Share of slow games |", "|---|---:|---:|"]
    for tc, counts in result["slowTimeControls"].items():
        out.append(f"| {tc} | {counts['games']:,} | {100 * counts['share']:.2f}% |")
    if "selectedSlowTimeControls" in result:
        out += ["", "Slow controls in the exported cohort; a unique game is counted once, "
                "and a player-game once for each eligible side. Primary columns count only eligible primary players.", "",
                "| Time control | Unique games | Share | Player-games | Share | Primary unique games | Share | Primary player-games | Share |",
                "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
        for tc, counts in result["selectedSlowTimeControls"].items():
            out.append(f"| {tc} | " + " | ".join(f"{counts[key]:,} | {100 * counts[key + 'Share']:.2f}%"
                       for key in ("games", "playerGames", "primaryGames", "primaryPlayerGames")) + " |")
    out += ["", "No cap is imposed on rating. Games without an eval or clock on even the final move are excluded. "
            "Unlike the predecessor's reader, this does not exempt a final mate. "
            "Player-game counts precede bridge replay and move eligibility checks.", ""]
    return "\n".join(out)


def run(months: list[str], selected_k: str, export: bool) -> dict:
    started = time.perf_counter()
    snapshots = {month: json.loads((PRIVATE / f"games-{month}.json").read_text()) for month in months}
    players = {}
    names = {}
    seen = set()
    duplicates = 0
    controls = collections.Counter()
    per_month = {}
    for month, state in snapshots.items():
        count = collections.Counter()
        for game in records(month, state["outputBytes"]):
            if game["id"] in seen:
                duplicates += 1
                continue
            seen.add(game["id"])
            count[game["budget"]] += 1
            controls[game["tc"]] += 1
            for side in ("white", "black"):
                name = game[side]
                identity = player_id(name)
                if identity in names and names[identity] != name:
                    raise RuntimeError("player id collision")
                names[identity] = name
                player = players.setdefault(identity, empty_player())
                player["games"][game["budget"]] += 1
                player["ratingSum"] += game[f"{side}Elo"]
                player["months"].setdefault(month, {"fast": 0, "slow": 0})[game["budget"]] += 1
        per_month[month] = dict(count)
    names.clear()
    for player in players.values():
        player["meanRating"] = player["ratingSum"] / sum(player["games"].values())
        player["primary"] = primary(player)
    by_k = {str(k): count_set(players, k) for k in K_VALUES}
    if selected_k == "auto":
        enough = [k for k in K_VALUES if by_k[str(k)]["primaryPlayers"] >= TARGET_PLAYERS
                  and by_k[str(k)]["primaryPlayers"] >= RETAIN_K2 * by_k["2"]["primaryPlayers"]]
        chosen = max(enough, default=2)
    else:
        chosen = int(selected_k)
    if by_k["2"]["primaryPlayers"] >= TARGET_PLAYERS:
        stop_reason = "paired-player target reached"
    elif all(state["complete"] for state in snapshots.values()):
        stop_reason = "complete sources below target"
    else:
        stop_reason = "count checkpoint below target"
    eligible_k = [k for k in K_VALUES if by_k[str(k)]["primaryPlayers"] >= TARGET_PLAYERS
                  and by_k[str(k)]["primaryPlayers"] >= RETAIN_K2 * by_k["2"]["primaryPlayers"]]
    if selected_k != "auto":
        selection_explanation = "K was explicitly requested by the command."
    elif eligible_k:
        selection_explanation = (f"It is the largest registered K with at least {TARGET_PLAYERS:,} primary players "
                                 f"and at least {100 * RETAIN_K2:.0f}% of K=2's primary players.")
    else:
        selection_explanation = (f"No registered K reaches both the {TARGET_PLAYERS:,}-player target and "
                                 f"{100 * RETAIN_K2:.0f}% K=2 retention; the registered fallback is K=2.")
    source_hashes = {month: prefix_hash(month, state["outputBytes"]) for month, state in snapshots.items()}
    specification = {"months": months, "sourceSha256": source_hashes, "k": chosen,
                     "primary": [PRIMARY_LO, PRIMARY_HI_EXCLUSIVE], "schema": 1}
    fingerprint = hashlib.sha256(json.dumps(specification, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    for player in players.values():
        player["eligible"] = qualifies(player, chosen)
    slow_total = sum(n for tc, n in controls.items() if tc != "600+0")
    pin = json.loads((LAB / "bridge" / "chess.json").read_text())
    app_commit = pin.get("commit", pin.get("app"))
    if not app_commit:
        raise RuntimeError("app pin has no commit")
    result = {
        "schema": 1, "appCommit": app_commit, "months": months,
        "sources": snapshots, "sourceSha256": source_hashes, "fingerprint": fingerprint,
        "uniqueGames": len(seen), "duplicateGames": duplicates, "uniquePlayers": len(players),
        "perMonthGames": per_month, "byK": by_k,
        "byMonthK": {month: {str(k): count_set(players, k, month) for k in K_VALUES} for month in months},
        "selectedK": chosen, "selected": by_k[str(chosen)],
        "stopReason": stop_reason, "selectionExplanation": selection_explanation,
        "primaryRating": {"loInclusive": PRIMARY_LO, "hiExclusive": PRIMARY_HI_EXCLUSIVE},
        "selectionRule": {"targetPrimaryPlayers": TARGET_PLAYERS, "minK2Retention": RETAIN_K2, "choices": list(K_VALUES)},
        "slowTimeControls": {tc: {"games": n, "share": n / slow_total} for tc, n in sorted(controls.items()) if tc != "600+0"},
    }
    if export:
        result["exports"], result["selectedSlowTimeControls"] = export_games(snapshots, players, chosen, fingerprint)
        atomic_json(PRIVATE / "cohort.json", {**specification, "fingerprint": fingerprint,
                    "selectedK": chosen, "players": players, "exports": result["exports"]})
    result["seconds"] = round(time.perf_counter() - started, 3)
    out = PROJECT / "results"
    out.mkdir(parents=True, exist_ok=True)
    recover_history()
    record_history(result)
    atomic_json(out / "cohort-counts.json", result)
    (out / "cohort-counts.md").write_text(markdown(result))
    print(json.dumps({"months": months, "byK": by_k, "selectedK": chosen, "uniqueGames": len(seen),
                      "seconds": result["seconds"], "fingerprint": fingerprint}), file=sys.stderr)
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", nargs="+", required=True)
    ap.add_argument("--select-k", choices=["auto", "2", "3", "5"], default="auto")
    ap.add_argument("--export", action="store_true", help="freeze and export the selected cohort's games for the bridge")
    args = ap.parse_args()
    run(args.months, args.select_k, args.export)
    return 0


if __name__ == "__main__":
    sys.exit(main())
