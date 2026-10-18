#!/usr/bin/env python3
"""Freeze phase-two content without depending on this branch's commit ids."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
MANIFEST = PROJECT / 'phase2-manifest.json'
FILES = ('stream.py', 'detect.mjs', 'positions.mjs', 'score.mjs', 'analyze.py',
         'freeze.py', 'run_phase2.py', 'phase2.sh', 'implementation-notes.md',
         'test_stream.py', 'tests-positions.mjs', 'tests-score.mjs', 'test_analysis.py')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def rule_digest():
    raw = (PROJECT / 'README.md').read_bytes().split(b'## Files', 1)[0]
    return hashlib.sha256(raw).hexdigest()

def snapshot():
    pin = json.loads((LAB / 'bridge/chess.json').read_text())
    return {'schema': 1, 'app': pin['commit'], 'records': pin['records'],
            'datasetKind': 'literal', 'alternativeScoringAuthorized': False,
            'rule': {'path': 'README.md', 'scope': 'before ## Files', 'sha256': rule_digest()},
            'files': {name: digest(PROJECT / name) for name in FILES}}

def verify_manifest(require_committed=True):
    saved = json.loads(MANIFEST.read_text())
    current = snapshot()
    if saved != current:
        raise ValueError('phase-two content differs from the frozen manifest')
    if require_committed:
        # Read the committed file itself. Its content survives rebase; no
        # branch commit identifier is recorded or used as a lookup key.
        relative = MANIFEST.relative_to(LAB).as_posix()
        committed = subprocess.check_output(['git', 'show', f'HEAD:{relative}'], cwd=LAB)
        if json.loads(committed) != saved:
            raise ValueError('phase-two content manifest is not committed')
    return saved

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()
    if args.write:
        MANIFEST.write_text(json.dumps(snapshot(), indent=2) + '\n')
        print('Wrote content hashes; commit the manifest before the full run.')
    else:
        verify_manifest()
        print('Committed phase-two content hashes match.')
