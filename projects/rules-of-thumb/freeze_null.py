#!/usr/bin/env python3
"""Freeze the post-verdict addition without changing the original experiment.

The original app and records pins govern this addition, even if the lab's
current bridge pin has moved. All provenance is content based. Private
input manifests contain only fixed filenames and their content hashes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
MANIFEST = PROJECT / "null-manifest.json"
INPUT_MANIFEST = PROJECT / "null-input-manifest.json"
ORIGINAL_DIRECTORY = LAB / "private/rules-of-thumb/full"
MONTHS = ("2026-09", "2026-07", "2026-08")
ADDITION = b"## Added after the rule was applied\n"
FOLLOWING = b"## Who runs it\n"
NEW_FILES = ("freeze_null.py", "run_null.py", "null.sh", "test_null_runner.py",
             "null-common.mjs", "null-score.mjs", "tests-null-score.mjs", "null-readings.md",
             "analyze_null.py", "test_null_analysis.py", "examples-null.mjs", "tests-null-examples.mjs")
ORIGINAL_EXTRA = ("phase2-manifest.json", "operations.py", "test_operations.py",
                  "results/rules.json", "results/rules.md", "results/operations.json", "results/operations.md")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def json_read(path):
    return json.loads(path.read_text())


def rule_parts(raw):
    """Remove exactly the addition, preserving every original rule byte."""
    require(raw.count(b"## Files\n") == 1, "README Files boundary is ambiguous")
    prefix = raw.split(b"## Files\n", 1)[0]
    require(prefix.count(ADDITION) == 1 and prefix.count(FOLLOWING) == 1,
            "README addition boundaries are ambiguous")
    start = prefix.index(ADDITION)
    end = prefix.index(FOLLOWING)
    require(start < end, "README addition is not before Who runs it")
    addition = prefix[start:end]
    original = prefix[:start] + prefix[end:]
    sha = lambda value: hashlib.sha256(value).hexdigest()
    return {"path": "README.md", "additionHeading": ADDITION.decode().strip(),
            "additionSha256": sha(addition), "originalRuleSha256": sha(original),
            "combinedRuleSha256": sha(prefix)}


def original_snapshot(project=PROJECT):
    original = json_read(project / "phase2-manifest.json")
    require(original.get("schema") == 2 and original.get("datasetKind") == "amended",
            "original phase-two manifest is not the completed amended study")
    rule = rule_parts((project / "README.md").read_bytes())
    require(rule["originalRuleSha256"] == original["rule"]["sha256"],
            "removing the addition does not recover the frozen original rule")
    for name, expected in original["files"].items():
        require(digest(project / name) == expected, "an original frozen measurement source changed")
    result = json_read(project / "results/rules.json")
    require(result.get("app") == original["app"] and result.get("datasetKind") == "amended"
            and result.get("contentManifestSha256") == digest(project / "phase2-manifest.json")
            and result.get("ruleReadmeSha256") == original["rule"]["sha256"],
            "the completed original analysis does not match its frozen experiment")
    names = sorted(set(original["files"]) | set(ORIGINAL_EXTRA))
    return original, rule, {name: digest(project / name) for name in names}


def input_snapshot(project=PROJECT, directory=ORIGINAL_DIRECTORY):
    original, _rule, _files = original_snapshot(project)
    result = json_read(project / "results/rules.json")
    files = {}
    for month in MONTHS:
        stream_path = directory / f"games-{month}.json"
        stream = json_read(stream_path)
        require(stream.get("complete") is True and stream.get("run") == "full"
                and stream.get("month") == month and stream.get("app") == original["app"]
                and stream.get("streamVersion") == original["files"]["stream.py"],
                "original game stream is incomplete or incompatible")
        games_path = directory / f"games-{month}.jsonl.gz"
        files[games_path.name] = digest(games_path)
        require(files[games_path.name] == stream["outputSha256"], "original streamed games changed")
        files[stream_path.name] = digest(stream_path)
        position_path = directory / f"positions-{month}.json"
        positions = json_read(position_path)
        require(positions.get("complete") is True and positions.get("run") == "full"
                and positions.get("datasetKind") == "amended" and positions.get("app") == original["app"]
                and positions.get("month") == month, "original position scan is incomplete or incompatible")
        require(positions["games"] == stream["kept"], "original stream and position game counts differ")
        raw_path = directory / f"positions-{month}.jsonl.gz"
        files[raw_path.name] = digest(raw_path)
        require(files[raw_path.name] == positions["outputSha256"], "original positions changed after their scan")
        files[position_path.name] = digest(position_path)
        total = 0
        for shard in range(2):
            path = directory / f"scored-{month}-{shard}-of-2.json"
            score = json_read(path)
            require(score.get("complete") is True and score.get("status") == "complete"
                    and score.get("run") == "full" and score.get("datasetKind") == "amended"
                    and score.get("timing") is False and score.get("month") == month
                    and score.get("app") == original["app"] and score.get("shard") == shard
                    and score.get("shards") == 2, "original score shard is incomplete or incompatible")
            require(score["rows"] == score["expectedRows"] and score["inputSha256"] == files[raw_path.name]
                    and score["scorerVersion"] == original["files"]["score.mjs"], "original score provenance differs")
            total += score["rows"]
            files[path.name] = digest(path)
            journal = path.with_suffix(".jsonl")
            files[journal.name] = digest(journal)
        require(total == positions["keptPositions"] == sum(row["countsByMonth"][month]["scoredPositions"]
                for row in result["rules"].values()), "original scored coverage differs from its analysis")
    for shard in range(2):
        path = directory / f"tablebase-{shard}-of-2.json"
        files[path.name] = digest(path)
    return {"schema": 1, "datasetKind": "amended", "app": original["app"], "records": original["records"],
            "files": dict(sorted(files.items()))}


def snapshot(project=PROJECT):
    original, rule, original_files = original_snapshot(project)
    inputs = json_read(project / "null-input-manifest.json")
    require(inputs.get("schema") == 1 and inputs.get("datasetKind") == "amended"
            and inputs.get("app") == original["app"] and inputs.get("records") == original["records"],
            "null input manifest has incompatible provenance")
    return {"schema": 1, "datasetKind": "null", "app": original["app"], "records": original["records"],
            "rule": rule, "newFiles": {name: digest(project / name) for name in NEW_FILES},
            "originalFiles": original_files,
            "inputs": {"path": "null-input-manifest.json", "sha256": digest(project / "null-input-manifest.json")}}


def require_committed_file(path, lab=LAB):
    relative = path.relative_to(lab).as_posix()
    committed = subprocess.check_output(["git", "show", f"HEAD:{relative}"], cwd=lab)
    require(committed == path.read_bytes(), "a null content manifest is not committed byte-for-byte")


def verify_manifest(require_committed=True, verify_inputs=True):
    saved = json_read(MANIFEST)
    require(saved == snapshot(), "null rule or source content differs from its frozen manifest")
    if verify_inputs:
        require(json_read(INPUT_MANIFEST) == input_snapshot(), "a frozen original private input changed")
    if require_committed:
        require_committed_file(MANIFEST)
        require_committed_file(INPUT_MANIFEST)
    return saved


def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="freeze complete original inputs and the addition before any added metric")
    parser.add_argument("--sources-only", action="store_true", help="verify frozen source hashes without rehashing original private inputs")
    args = parser.parse_args(argv)
    if args.write:
        require(not args.sources_only, "--write and --sources-only cannot be combined")
        # Refuse missing new files before creating either manifest.
        require(all((PROJECT / name).is_file() for name in NEW_FILES), "the new source set is incomplete")
        atomic_json(INPUT_MANIFEST, input_snapshot())
        atomic_json(MANIFEST, snapshot())
        print("Wrote null content and original-input hashes. Commit both manifests and the new sources before running.")
    else:
        verify_manifest(verify_inputs=not args.sources_only)
        print("Committed null content hashes match the original experiment and the fixed addition.")


if __name__ == "__main__":
    main()
