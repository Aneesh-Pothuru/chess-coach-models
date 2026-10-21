#!/usr/bin/env python3
"""Freeze the fixed rule, sources, installed app and game bytes before parsing."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
MANIFEST = PROJECT / "manifest.json"
INPUT_MANIFEST = PROJECT / "input-manifest.json"
MONTHS = ("2026-09", "2026-07", "2026-08")
APP = "ffee8dbb166f77dcc75721b6cca28d37703f4515"
SOURCE_APP = "f4bd63f19b343f686fb97ea4cf70b211c0bddc0a"
GAME_DIRECTORY = LAB / "private/rules-of-thumb/full"
MAIA_MODEL = f".cache/chess/{SOURCE_APP}/tools/coach-review/.cache/maia/maia2-f2ded336c9574510.onnx"
RULE_SHA256 = "d96d65149cb363478839aea2653efa3a66a845514eb7d7a109e3428cd99a152e"
SUPPLIED = {
    "app-pin.json": "388d1623c7971bf836eed6876d0dd358fa3ba3cd757a003062d37097a65c7937",
    "app.sh": "5f2cfed31b2eb936c4112fda1d90479496dd2a1eba01b4e3aa0e60852e3e934c",
    "readings.mjs": "08bcf48eec4a59dea484febb55a68f3bd1b8376ddd417235bb0c35870faf7ec8",
    "tests-readings.mjs": "32a85de2607da9aa7cf80a36fc31a86d9dbd10fade89332761a8ee1a8981a2cd",
    "june.py": "e0f3a0b8812f2224711937debe8807258dd1f3497cdadf12a87708ef96f5061e",
    "availability.mjs": "f911bf142e357bc19cd46414eb1faf490bde81ae43b2de4e938c75ab04e08f0f",
    "results/availability.json": "8a73c62a80d49848869ad59b4518b50c126042f1bf8018e59a666f2f61ff11e5",
    "results/availability.md": "3a2dc58ac83334b3139c78f5e0eca83267d6b1e21d04947d16fb4582ec7ffb86",
}
FILES = (*SUPPLIED, "freeze.py", "run.py", "run.sh", "test_runner.py", "timing.py",
         "common.mjs", "scan.mjs", "select.mjs", "tests-scan.mjs", "tests-common.mjs", "score.mjs", "tests-score.mjs",
         "analyze.py", "test_analysis.py", "examples.mjs", "tests-examples.mjs", "readings.md")
PREDECESSOR_FILES = ("projects/rules-of-thumb/detect.mjs", "projects/rules-of-thumb/score.mjs",
                     "projects/rules-of-thumb/positions.mjs",
                     "projects/rules-of-thumb/analyze.py", "projects/rules-of-thumb/null-common.mjs",
                     "projects/rules-after-check/results/operations.json")
BRIDGE_FILES = ("chess.json", "checkout.sh", "run.sh", "lib/chess.mjs", "lib/lab.mjs", "lib/register.mjs", "lib/app-packages.mjs")
ENGINE_ASSETS = ("node_modules/stockfish/bin/stockfish-18-lite-single.js",
                 "node_modules/stockfish/bin/stockfish-18-lite-single.wasm")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text())


def encode(data):
    return (json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_bytes(encode(data))
    temporary.replace(path)


def require_committed_file(path, lab=LAB):
    committed = subprocess.check_output(["git", "show", f"HEAD:{path.relative_to(lab).as_posix()}"], cwd=lab)
    require(committed == path.read_bytes(), "a content manifest is not committed byte-for-byte")


def input_snapshot(directory=GAME_DIRECTORY):
    """Only summaries are parsed. Even a malformed gzip is just bytes here."""
    files, months = {}, {}
    for month in MONTHS:
        metadata = directory / f"games-{month}.json"
        raw = directory / f"games-{month}.jsonl.gz"
        data = read_json(metadata)
        require(data.get("complete") is True and data.get("month") == month and data.get("run") == "full"
                and data.get("app") == SOURCE_APP and data.get("cap") == 30000 and data.get("kept") == 30000,
                "a source stream is incomplete or differs from the registered data")
        found = digest(raw)
        require(found == data.get("outputSha256"), "a source stream differs from its summary content hash")
        files[metadata.name], files[raw.name] = digest(metadata), found
        months[month] = {"games": data["kept"], "outputSha256": found}
    return {"schema": 1, "datasetKind": "tiebreak-rules-games", "source": "rules-of-thumb/full",
            "files": dict(sorted(files.items())), "months": months}


def confined_resolve(path, lab=LAB):
    """Resolve links one component at a time; never stat an external target.

    A link itself is inside the clone and may be read. Its target's path
    components are checked before any filesystem operation on each one.
    The returned chain contains hashes, not raw link text or external paths.
    """
    boundary = Path(os.path.abspath(lab))
    target = Path(path) if Path(path).is_absolute() else Path.cwd() / path
    if not target.is_relative_to(boundary):
        return "external", None, []
    current, parts, seen, chain = boundary, list(target.relative_to(boundary).parts), set(), []
    while parts:
        component = parts.pop(0)
        if component == ".":
            continue
        if component == "..":
            current = current.parent
            if not current.is_relative_to(boundary):
                return "external", None, chain
            continue
        candidate = current / component
        try:
            mode = candidate.lstat().st_mode
        except (FileNotFoundError, NotADirectoryError):
            return "dangling-internal", None, chain
        if stat.S_ISLNK(mode):
            require(candidate not in seen, "dependency symlink cycle")
            seen.add(candidate)
            text = os.readlink(candidate)
            chain.append({"path": candidate.relative_to(boundary).as_posix(),
                          "targetTextSha256": hashlib.sha256(os.fsencode(text)).hexdigest()})
            if os.path.isabs(text):
                target = Path(text)
                if not target.is_relative_to(boundary):
                    return "external", None, chain
                parts = list(target.relative_to(boundary).parts) + parts
                current = boundary
            else:
                # Do not collapse '..' across a symlink: filesystem meaning
                # follows the preceding link before applying the parent step.
                parts = list(Path(text).parts) + parts
                current = candidate.parent
        else:
            if parts and not stat.S_ISDIR(mode):
                return "dangling-internal", None, chain
            current = candidate
    return "internal", current, chain


def confined_digest(path, lab=LAB):
    kind, resolved, _chain = confined_resolve(path, lab)
    require(kind == "internal" and resolved.is_file(), "required app asset is unavailable inside the clone")
    return digest(resolved)


def tree_snapshot(directory, lab=LAB):
    """Hash internal dependency bytes and link text; do not open external links."""
    kind, root, _chain = confined_resolve(directory, lab)
    require(kind == "internal" and root.is_dir(), "dependency root is unavailable inside the clone")
    hashes, links = {}, {}
    def visit(path, prefix, ancestors):
        kind, resolved, chain = confined_resolve(path, lab)
        if path.is_symlink():
            label = kind if kind != "internal" else "internal-directory" if resolved.is_dir() else "internal-file"
            links[prefix or "."] = {"kind": label, "targetTextSha256": hashlib.sha256(os.fsencode(os.readlink(path))).hexdigest(),
                                      "resolutionLinksSha256": hashlib.sha256(json.dumps(chain, sort_keys=True).encode()).hexdigest()}
        if kind != "internal":
            require(path.is_symlink(), "a dependency file disappeared during hashing")
            return
        if resolved.is_dir():
            require(resolved not in ancestors, "dependency directory symlink cycle")
            for child in sorted(resolved.iterdir(), key=lambda item: item.name):
                visit(child, f"{prefix}/{child.name}".lstrip("/"), ancestors | {resolved})
        else:
            require(resolved.is_file(), "unsupported dependency file type")
            hashes[prefix] = digest(resolved)
    visit(directory, "", set())
    require(hashes, "empty dependency tree")
    payload = json.dumps({"files": hashes, "links": links}, sort_keys=True, separators=(",", ":")).encode()
    counts = {kind: sum(link["kind"] == kind for link in links.values()) for kind in sorted({link["kind"] for link in links.values()})}
    return {"files": len(hashes), "contentSha256": hashlib.sha256(payload).hexdigest(),
            "resolvedPath": root.relative_to(Path(os.path.abspath(lab))).as_posix(), "linkCounts": counts,
            "linksSha256": hashlib.sha256(json.dumps(links, sort_keys=True).encode()).hexdigest(),
            "untraversedLinks": {name: data for name, data in links.items() if data["kind"] in ("external", "dangling-internal")}}


def app_snapshot(lab=LAB):
    app = lab / ".cache/chess" / APP
    require(subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=app, text=True).strip() == APP,
            "the cached app pin differs")
    tracked = ["src", "package.json", "package-lock.json"]
    require(subprocess.run(["git", "diff", "--quiet", "HEAD", "--", *tracked], cwd=app).returncode == 0,
            "a pinned app instrument or dependency declaration changed")
    require(not subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "--", "src"], cwd=app),
            "the cached app has untracked instrument sources")
    names = subprocess.check_output(["git", "ls-files", "-z", "--", *tracked], cwd=app).decode().split("\0")
    hashes = {name: digest(app / name) for name in sorted(filter(None, names))}
    require("package-lock.json" in hashes and "package.json" in hashes and len(hashes) > 2, "app source inventory is incomplete")
    payload = json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()
    model = lab / MAIA_MODEL
    return {"commit": APP, "sourceFiles": len(hashes), "sourceContentSha256": hashlib.sha256(payload).hexdigest(),
            "packageLockSha256": hashes["package-lock.json"], "dependencies": tree_snapshot(app / "node_modules", lab),
            "assets": {**{name: confined_digest(app / name, lab) for name in ENGINE_ASSETS}, MAIA_MODEL: confined_digest(model, lab)}}


def snapshot(project=PROJECT, lab=LAB):
    raw = (project / "README.md").read_bytes()
    require(raw.count(b"## Files\n") == 1, "README Files boundary differs")
    rule_hash = hashlib.sha256(raw.split(b"## Files\n", 1)[0]).hexdigest()
    require(rule_hash == RULE_SHA256, "the fixed README rule changed")
    for name, expected in SUPPLIED.items():
        require(digest(project / name) == expected, "a supplied project file changed")
    pins = read_json(project / "app-pin.json")
    require(pins["commit"] == APP, "app pin differs from the fixed rule")
    return {"schema": 1, "datasetKind": "tiebreak-rules", "app": APP,
            "rule": {"path": "README.md", "scope": "before ## Files", "sha256": rule_hash},
            "readmeSha256": digest(project / "README.md"),
            "files": {name: digest(project / name) for name in FILES},
            "predecessorFiles": {name: digest(lab / name) for name in PREDECESSOR_FILES},
            "bridgeFiles": {name: digest(lab / "bridge" / name) for name in BRIDGE_FILES},
            "appCode": app_snapshot(lab), "inputs": {"path": "input-manifest.json", "sha256": digest(project / "input-manifest.json")}}


def verify_manifest(require_committed=True, verify_inputs=True):
    saved = read_json(MANIFEST)
    require(saved == snapshot(), "rule, source, app or dependency content differs from its freeze")
    if verify_inputs:
        require(read_json(INPUT_MANIFEST) == input_snapshot(), "a frozen game input changed")
    if require_committed:
        require_committed_file(MANIFEST)
        require_committed_file(INPUT_MANIFEST)
    return saved


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--timing", action="store_true", help="verify matching content without requiring a commit; scanner timing only")
    parser.add_argument("--sources-only", action="store_true")
    args = parser.parse_args(argv)
    require(not args.write or not (args.timing or args.sources_only), "freeze write has no verification flags")
    if args.write:
        require(all((PROJECT / name).is_file() for name in FILES), "source inventory is incomplete")
        atomic_json(INPUT_MANIFEST, input_snapshot())
        atomic_json(MANIFEST, snapshot())
        print("Rule, sources, installed instruments and game byte hashes frozen. No game was parsed.")
    else:
        verify_manifest(require_committed=not args.timing, verify_inputs=not args.sources_only)
        print("Frozen content and requested game byte hashes match.")


if __name__ == "__main__":
    main()
