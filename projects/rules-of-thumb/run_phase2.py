#!/usr/bin/env python3
"""Run the reviewed literal study, resumably, with two heavy workers.

One stream process may overlap the workers. Logs are private. Stage events
contain only aggregate operational metadata, never a position or game id.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import threading
import time
import uuid
from freeze import LAB, PROJECT, verify_manifest

DIRECTORY = LAB / 'private/rules-of-thumb/full'
MONTHS = ('2026-07', '2026-08', '2026-09')
LOCK = threading.Lock()
RUN_LOCK_FD = None

def event(data):
    data = {'at': datetime.now(timezone.utc).isoformat(), **data}
    with LOCK:
        with (DIRECTORY / 'stage-events.jsonl').open('a') as out:
            out.write(json.dumps(data, separators=(',', ':')) + '\n')
    print(json.dumps(data), flush=True)

def complete(stage, month):
    if stage == 'analysis':
        return False
    stem = 'games' if stage == 'stream' else 'positions'
    paths = ([DIRECTORY / f'{stem}-{month}.json'] if stage != 'score' else
             [DIRECTORY / f'scored-{month}-{i}-of-2.json' for i in range(2)])
    if not all(path.exists() for path in paths):
        return False
    for path in paths:
        meta = json.loads(path.read_text())
        if not meta.get('complete') or meta.get('run') != 'full':
            return False
        if stage != 'stream' and meta.get('datasetKind') != 'literal':
            raise ValueError('alternative or unmarked data cannot enter the literal run')
        if stage in ('stream', 'positions'):
            file = path.with_suffix('.jsonl.gz')
            if hashlib.sha256(file.read_bytes()).hexdigest() != meta['outputSha256']:
                raise ValueError('completed output content changed')
    return True

def run_stage(stage, month):
    verify_manifest()
    if complete(stage, month):
        event({'stage': stage, 'month': month, 'event': 'already-complete'})
        return
    python = str(LAB / '.venv/bin/python')
    bridge = str(LAB / 'bridge/run.sh')
    script = PROJECT / {'stream': 'stream.py', 'positions': 'positions.mjs',
                        'score': 'score.mjs', 'analysis': 'analyze.py'}[stage]
    cmd = ['nice', '-n', '10', bridge if script.suffix == '.mjs' else python,
           str(script), '--run', 'full', '--phase2-reviewed']
    if month:
        cmd += ['--month', month]
    if stage in ('positions', 'score'):
        cmd += ['--pool', '2']
    # Stream restarts replay only the prefix, retaining durable chunks.
    # Referee failures have their own bounded tablebase retries; the runner
    # stops and preserves the failure for inspection rather than looping it.
    attempts = 4 if stage == 'stream' else 1
    for number in range(attempts):
        attempt = str(uuid.uuid4())
        started = time.monotonic()
        log = DIRECTORY / 'logs' / f'{stage}-{month or "all"}-{attempt}.log'
        event({'stage': stage, 'month': month, 'attempt': attempt, 'event': 'started'})
        with log.open('ab') as out:
            result = subprocess.run(cmd, cwd=LAB, stdout=out, stderr=subprocess.STDOUT,
                                    pass_fds=() if RUN_LOCK_FD is None else (RUN_LOCK_FD,))
        elapsed = time.monotonic() - started
        event({'stage': stage, 'month': month, 'attempt': attempt,
               'event': 'completed' if result.returncode == 0 else 'stopped',
               'seconds': elapsed, 'exitCode': result.returncode})
        if result.returncode == 0:
            return
        if number + 1 < attempts:
            delay = (5, 15, 30)[number]
            event({'stage': stage, 'month': month, 'event': 'restart-backoff', 'seconds': delay})
            time.sleep(delay)
    raise RuntimeError(f'{stage} {month or "all"} stopped; inspect private logs before resuming')

def main():
    global RUN_LOCK_FD
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--reviewed', action='store_true')
    args = ap.parse_args()
    if not args.reviewed:
        ap.error('use --reviewed after the reviewer authorizes the run')
    verify_manifest()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    (DIRECTORY / 'logs').mkdir(exist_ok=True)
    with (DIRECTORY / 'run.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Stage parents retain the same lock if the supervisor is killed;
        # a resume cannot launch duplicate workers while they still run.
        RUN_LOCK_FD = lock.fileno()
        with ThreadPoolExecutor(max_workers=1) as executor:
            streams = {month: executor.submit(run_stage, 'stream', month) for month in MONTHS}
            # All availability is retained before the first literal score.
            for month in MONTHS:
                streams[month].result()
                run_stage('positions', month)
        for month in MONTHS:
            run_stage('score', month)
        run_stage('analysis', None)
        print('Literal analysis complete. Stop before the answer and paper.', flush=True)

if __name__ == '__main__':
    main()
