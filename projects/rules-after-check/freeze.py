#!/usr/bin/env python3
"""Freeze this rule and both predecessor runs without reading private rows."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PREDECESSOR = LAB / "projects/rules-of-thumb"
PRIVATE = LAB / "private/rules-of-thumb"
MANIFEST = PROJECT / "manifest.json"
INPUT_MANIFEST = PROJECT / "input-manifest.json"
MONTHS = ("2026-09", "2026-07", "2026-08")
BOARD_APP = "3437a711843006926c0804394b9087c5a55d4bcf"
REFEREE_APP = "f4bd63f19b343f686fb97ea4cf70b211c0bddc0a"
RECORDS = "aed714ada579782ce73630596e59c8b65e74cb30"
FILES = ("freeze.py", "run.py", "run.sh", "test_runner.py", "checkout.py", "app-pins.json",
         "common.mjs", "tests-common.mjs", "board.mjs", "score.mjs", "tests-board.mjs", "tests-score.mjs",
         "analyze.py", "test_analysis.py", "examples.mjs", "tests-examples.mjs", "readings.md", "cost.py",
         "results/cost.json", "results/cost.md")
BRIDGE_FILES = ("chess.json", "checkout.sh", "run.sh", "lib/chess.mjs", "lib/lab.mjs", "lib/register.mjs")
REFEREE_ASSETS = ("node_modules/stockfish/bin/stockfish-18-lite-single.js",
                  "node_modules/stockfish/bin/stockfish-18-lite-single.wasm",
                  "tools/coach-review/.cache/maia/maia2-f2ded336c9574510.onnx")
OLD_EXTRA = ("README.md", "frozen-readme.md", "answer_check.py", "phase2-manifest.json",
             "null-manifest.json", "null-input-manifest.json", "results/null.json", "results/null.md",
             "results/examples.json", "results/examples.md")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    # This is the only reader of private journals and compressed position files.
    # They are streamed as bytes, never decoded, parsed or decompressed here.
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def require_committed_file(path, lab=LAB):
    committed = subprocess.check_output(["git", "show", f"HEAD:{path.relative_to(lab).as_posix()}"], cwd=lab)
    require(committed == path.read_bytes(), "a content manifest is not committed byte-for-byte")


def check_predecessor_answer(project):
    # The old freezer checks the old live README and cannot be invoked after its
    # answer was written. Its separate answer check uses frozen-readme.md only.
    result = subprocess.run([sys.executable, "-B", str(project / "answer_check.py")],
                            capture_output=True, text=True)
    require(result.returncode == 0, "the predecessor answer/frozen-rule check failed")


def predecessor_snapshot(project=PREDECESSOR):
    check_predecessor_answer(project)
    phase2 = read_json(project / "phase2-manifest.json")
    null = read_json(project / "null-manifest.json")
    require(phase2.get("app") == null.get("app") == REFEREE_APP
            and phase2.get("records") == null.get("records") == RECORDS,
            "the predecessor app or records pin differs from this rule")
    for group in (phase2["files"], null["originalFiles"], null["newFiles"]):
        for name, expected in group.items():
            require(digest(project / name) == expected, "a predecessor frozen source or result changed")
    require(digest(project / "null-input-manifest.json") == null["inputs"]["sha256"],
            "the predecessor input manifest changed")
    names = sorted(set(phase2["files"]) | set(null["originalFiles"]) | set(null["newFiles"]) | set(OLD_EXTRA))
    return {name: digest(project / name) for name in names}


def input_snapshot(predecessor=PREDECESSOR, private=PRIVATE):
    """Read only aggregate manifests; hash every private row file as raw bytes."""
    phase2 = read_json(predecessor / "phase2-manifest.json")
    null = read_json(predecessor / "null-manifest.json")
    previous = read_json(predecessor / "null-input-manifest.json")
    require(previous.get("app") == REFEREE_APP and previous.get("records") == RECORDS,
            "original private input pins differ")
    expected = {f"games-{month}.{suffix}" for month in MONTHS for suffix in ("json", "jsonl.gz")}
    expected |= {f"positions-{month}.{suffix}" for month in MONTHS for suffix in ("json", "jsonl.gz")}
    expected |= {f"scored-{month}-{shard}-of-2.{suffix}" for month in MONTHS
                 for shard in range(2) for suffix in ("json", "jsonl")}
    expected |= {f"tablebase-{shard}-of-2.json" for shard in range(2)}
    require(set(previous["files"]) == expected, "original private input inventory differs")
    files = {}
    for name, expected_hash in previous["files"].items():
        found = digest(private / "full" / name)
        require(found == expected_hash, "an original private input changed")
        files[f"full/{name}"] = found
    null_hash = digest(predecessor / "null-manifest.json")
    for month in MONTHS:
        original_count = null_count = 0
        positions_hash = files[f"full/positions-{month}.jsonl.gz"]
        positions = read_json(private / "full" / f"positions-{month}.json")
        require(positions.get("complete") is True and positions.get("datasetKind") == "amended"
                and positions.get("app") == REFEREE_APP and positions.get("run") == "full",
                "original positions are incomplete or incompatible")
        for shard in range(2):
            name = f"scored-{month}-{shard}-of-2.json"
            original = read_json(private / "full" / name)
            meta = read_json(private / "null" / name)
            for item, kind, source in ((original, "amended", phase2["files"]["score.mjs"]),
                                       (meta, "null-addition", null["newFiles"]["null-score.mjs"])):
                require(item.get("complete") is True and item.get("status") == "complete"
                        and item.get("datasetKind") == kind and item.get("app") == REFEREE_APP
                        and item.get("run") == "full" and item.get("month") == month
                        and item.get("shard") == shard and item.get("shards") == 2
                        and item.get("scorerVersion") == source and item.get("inputSha256") == positions_hash
                        and type(item.get("rows")) is int and item["rows"] == item.get("expectedRows"),
                        "a predecessor score shard is incomplete or incompatible")
            require(meta.get("additionManifestSha256") == null_hash
                    and meta["keysSha256"] == original["keysSha256"] and meta["rows"] == original["rows"],
                    "predecessor score populations differ")
            path = private / "null" / name
            journal = path.with_suffix(".jsonl")
            files[f"null/{name}"] = digest(path)
            files[f"null/{journal.name}"] = digest(journal)
            require(files[f"null/{journal.name}"] == meta.get("outputSha256"), "a completed null journal changed")
            original_count += original["rows"]
            null_count += meta["rows"]
        require(original_count == null_count == positions["keptPositions"], "predecessor monthly coverage differs")
    return {"schema": 1, "source": "rules-of-thumb", "app": REFEREE_APP, "records": RECORDS,
            "files": dict(sorted(files.items()))}


def app_snapshot(pin, lab=LAB):
    directory = lab / ".cache/chess" / pin
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=directory, text=True).strip()
    require(actual == pin, "a cached app checkout has the wrong commit")
    clean = subprocess.run(["git", "diff", "--quiet", "HEAD", "--", "src", "package.json", "package-lock.json"], cwd=directory)
    require(clean.returncode == 0, "a cached app instrument or dependency declaration changed")
    untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "--", "src"], cwd=directory)
    require(not untracked, "a cached app has untracked instrument sources")
    names = subprocess.check_output(["git", "ls-files", "-z", "--", "src", "package.json", "package-lock.json"],
                                    cwd=directory).decode().split("\0")
    hashes = {name: digest(directory / name) for name in sorted(filter(None, names))}
    require("package.json" in hashes and "package-lock.json" in hashes and any(name.startswith("src/") for name in hashes),
            "cached app source inventory is incomplete")
    payload = json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()
    return {"commit": pin, "sourceFiles": len(hashes), "sourceContentSha256": hashlib.sha256(payload).hexdigest()}


def dependency_snapshot(lab=LAB):
    check = lab / ".cache/chess" / BOARD_APP
    score = lab / ".cache/chess" / REFEREE_APP
    lock = digest(score / "package-lock.json")
    require(digest(check / "package-lock.json") == lock, "the two app dependency locks differ")
    target = (score / "node_modules").resolve(strict=True)
    require(target.is_dir() and target.is_relative_to(lab.resolve()), "measured dependencies are outside this clone")
    require((check / "node_modules").is_symlink()
            and (check / "node_modules").resolve(strict=True) == target,
            "the check app must share the measured app's installed dependency tree")
    return {"shared": True, "sourceApp": REFEREE_APP, "packageLockSha256": lock}


def snapshot(project=PROJECT, lab=LAB, predecessor=PREDECESSOR):
    pins = read_json(project / "app-pins.json")
    require((pins.get("check"), pins.get("score"), pins.get("records")) == (BOARD_APP, REFEREE_APP, RECORDS),
            "project app pins differ from the fixed rule")
    inputs = read_json(project / "input-manifest.json")
    require(inputs.get("app") == REFEREE_APP and inputs.get("records") == RECORDS,
            "input manifest pins differ")
    raw = (project / "README.md").read_bytes()
    require(raw.count(b"## Files\n") <= 1, "README Files boundary is ambiguous")
    prefix = raw.split(b"## Files\n", 1)[0]
    return {"schema": 1, "datasetKind": "rules-after-check", "boardApp": BOARD_APP,
            "refereeApp": REFEREE_APP, "records": RECORDS,
            "apps": {"check": BOARD_APP, "score": REFEREE_APP, "records": RECORDS},
            "rule": {"path": "README.md", "scope": "before ## Files", "sha256": hashlib.sha256(prefix).hexdigest()},
            "readmeSha256": digest(project / "README.md"),
            "files": {name: digest(project / name) for name in FILES},
            "predecessorFiles": predecessor_snapshot(predecessor),
            "bridgeFiles": {name: digest(lab / "bridge" / name) for name in BRIDGE_FILES},
            "appCode": {"check": app_snapshot(BOARD_APP, lab), "score": app_snapshot(REFEREE_APP, lab)},
            "dependencies": dependency_snapshot(lab),
            "refereeAssets": {name: digest(lab / ".cache/chess" / REFEREE_APP / name) for name in REFEREE_ASSETS},
            "inputs": {"path": "input-manifest.json", "sha256": digest(project / "input-manifest.json")}}


def verify_manifest(require_committed=True, verify_inputs=True):
    saved = read_json(MANIFEST)
    require(saved == snapshot(), "rule, source, app or predecessor content differs from its freeze")
    if verify_inputs:
        require(read_json(INPUT_MANIFEST) == input_snapshot(), "a frozen private input changed")
    if require_committed:
        require_committed_file(MANIFEST)
        require_committed_file(INPUT_MANIFEST)
    return saved


def atomic_json(path, value):
    partial = path.with_suffix(path.suffix + ".partial")
    partial.write_text(json.dumps(value, indent=2) + "\n")
    partial.replace(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="hash sources and input bytes only; no private rows are parsed")
    parser.add_argument("--sources-only", action="store_true")
    args = parser.parse_args(argv)
    if args.write:
        require(not args.sources_only, "--write and --sources-only cannot be combined")
        require(all((PROJECT / name).is_file() for name in FILES), "the source set is incomplete")
        predecessor_snapshot()
        atomic_json(INPUT_MANIFEST, input_snapshot())
        atomic_json(MANIFEST, snapshot())
        print("Content and raw-input hashes written. Review and commit before any position is read.")
    else:
        verify_manifest(verify_inputs=not args.sources_only)
        print("Committed rule, sources, app pins and inputs match.")


if __name__ == "__main__":
    main()
