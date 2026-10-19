#!/usr/bin/env python3
"""Write or verify a rebase-stable content freeze before the first effect run."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
MANIFEST = PROJECT / 'freeze-manifest.json'
PROJECT_FILES = (
    'README.md', 'analyze.py', 'cohort.py', 'cost.py', 'detached.py', 'facts.mjs',
    'freeze.py', 'run_build.py', 'sample.py', 'stream.py', 'study.py', 'test_pipeline.py',
    'paper/paper.tex', 'paper/generate.mjs', 'paper/generated.tex',
    'results/cohort-counts.json', 'results/cohort-counts.md', 'results/sampling-history.json',
    'results/phase1.json', 'results/phase1.md', 'results/cost.json', 'results/cost.md',
)
DEPENDENCIES = (
    'bridge/chess.json', 'bridge/run.sh', 'bridge/checkout.sh',
    'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs', 'bridge/lib/register.mjs',
    'bridge/lib/app-packages.mjs', 'projects/think-time-rapid/games.mjs',
    'projects/think-time-rapid/moves.mjs', 'projects/paper.mjs', 'projects/preamble.tex',
    'scripts/check_private.py',
)
PATHS = tuple(sorted([f'projects/think-time-budget/{path}' for path in PROJECT_FILES] + list(DEPENDENCIES)))


def contents(path):
    source = LAB / path
    if not source.is_file():
        raise ValueError(f'freeze input is missing: {path}')
    data = source.read_bytes()
    return {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def check_manifest(require_committed=False):
    """Check before loading moves; do not read or record this branch's commit ID."""
    if not MANIFEST.is_file():
        raise ValueError('missing freeze-manifest.json; finish phase one, freeze and commit first')
    if require_committed:
        relative = str(MANIFEST.relative_to(LAB))
        tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', '--', relative],
                                 cwd=LAB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dirty = subprocess.check_output(['git', 'status', '--porcelain', '--', relative], cwd=LAB)
        if tracked.returncode or dirty:
            raise ValueError('commit the unchanged freeze manifest before running effects; staging it is not enough')
    frozen = json.loads(MANIFEST.read_text())
    if frozen.get('schema') != 1 or frozen.get('algorithm') != 'sha256':
        raise ValueError('unsupported freeze manifest format')
    entries = frozen.get('files', [])
    if [entry.get('path') for entry in entries] != list(PATHS):
        raise ValueError('freeze manifest has a different file set; review the phase-one freeze')
    changed = [entry['path'] for entry in entries if contents(entry['path']) != entry]
    if changed:
        raise ValueError('frozen content changed: ' + ', '.join(changed))
    return frozen


def write_manifest():
    if (PROJECT / 'results' / 'analysis.json').exists() or (PROJECT / 'results' / 'analysis.md').exists():
        raise ValueError('cannot replace the phase-one freeze after an effect report exists')
    report = json.loads((PROJECT / 'results' / 'phase1.json').read_text())
    if report.get('phase') != 1 or report.get('effectsComputed') is not False:
        raise ValueError('freeze requires a completed counts-only phase-one report')
    frozen = {'schema': 1, 'algorithm': 'sha256', 'files': [contents(path) for path in PATHS]}
    tmp = MANIFEST.with_suffix('.partial')
    tmp.write_text(json.dumps(frozen, indent=2) + '\n')
    tmp.replace(MANIFEST)
    return frozen


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('action', choices=['write', 'check'])
    ap.add_argument('--require-committed', action='store_true', help='check also requires a tracked, clean manifest')
    args = ap.parse_args()
    if args.action == 'write' and args.require_committed:
        ap.error('--require-committed applies only to check')
    try:
        frozen = write_manifest() if args.action == 'write' else check_manifest(args.require_committed)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
        raise SystemExit(str(exc)) from None
    print(json.dumps({'action': args.action, 'files': len(frozen['files']),
                      'manifest': str(MANIFEST.relative_to(LAB)),
                      'committedRequired': args.require_committed}))


if __name__ == '__main__':
    main()
