#!/usr/bin/env python3
"""Run the amended study, resumably, with two heavy workers.

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
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import uuid
from freeze import LAB, PROJECT, verify_manifest

DIRECTORY = LAB / 'private/rules-of-thumb/full'
MONTHS = ('2026-07', '2026-08', '2026-09')
LOCK = threading.Lock()
RUN_LOCK_FD = None
STOP = threading.Event()
CHILDREN = {}
SIGNAL_RECEIVED = False

def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)

def signal_stop(_signum, _frame):
    global SIGNAL_RECEIVED
    if _signum is not None:
        SIGNAL_RECEIVED = True
    STOP.set()
    for process in list(CHILDREN.values()):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

def stop_group(pgid):
    """Clean up surviving stage workers even when their parent has exited."""
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
    until = time.monotonic() + 3
    while time.monotonic() < until:
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.05)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass

def event(data):
    data = {'at': datetime.now(timezone.utc).isoformat(), **data}
    with LOCK:
        with (DIRECTORY / 'stage-events.jsonl').open('a') as out:
            out.write(json.dumps(data, separators=(',', ':')) + '\n')
    print(json.dumps(data), flush=True)

def complete(stage, month):
    if stage in ('analysis', 'backfill'):
        # Backfill checks its frozen source and resumes its own durable
        # prefix; never bypass those checks at the supervisor level.
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
        if stage != 'stream' and meta.get('datasetKind') != 'amended':
            raise ValueError('old or unmarked data cannot enter the amended run')
        if stage in ('stream', 'positions'):
            file = path.with_suffix('.jsonl.gz')
            if hashlib.sha256(file.read_bytes()).hexdigest() != meta['outputSha256']:
                raise ValueError('completed output content changed')
    return True

def run_stage(stage, month):
    if STOP.is_set():
        raise InterruptedError('driver received a stop signal')
    verify_manifest()
    if complete(stage, month):
        event({'stage': stage, 'month': month, 'event': 'already-complete'})
        return
    python = str(LAB / '.venv/bin/python')
    bridge = str(LAB / 'bridge/run.sh')
    script = PROJECT / {'stream': 'stream.py', 'backfill': 'backfill.mjs', 'positions': 'positions.mjs',
                        'score': 'score.mjs', 'analysis': 'analyze.py'}[stage]
    cmd = ['nice', '-n', '10', bridge if script.suffix == '.mjs' else python,
           str(script), '--run', 'full', '--phase2-reviewed']
    if month:
        cmd += ['--month', month]
    if stage in ('backfill', 'positions', 'score'):
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
            process = subprocess.Popen(cmd, cwd=LAB, stdin=subprocess.DEVNULL,
                stdout=out, stderr=subprocess.STDOUT, start_new_session=True,
                pass_fds=() if RUN_LOCK_FD is None else (RUN_LOCK_FD,))
            CHILDREN[process.pid] = process
            if STOP.is_set():
                os.killpg(process.pid, signal.SIGTERM)
            try:
                while True:
                    try:
                        code = process.wait(timeout=0.5)
                        break
                    except subprocess.TimeoutExpired:
                        if STOP.is_set():
                            stop_group(process.pid)
                if code != 0:
                    stop_group(process.pid)
            except BaseException:
                stop_group(process.pid)
                process.wait()
                raise
            finally:
                CHILDREN.pop(process.pid, None)
        elapsed = time.monotonic() - started
        event({'stage': stage, 'month': month, 'attempt': attempt,
               'event': 'completed' if code == 0 else 'stopped',
               'seconds': elapsed, 'exitCode': code,
               **({'stopReason': 'signal' if SIGNAL_RECEIVED else 'stage-failure'} if code else {})})
        if code == 0:
            return
        if STOP.is_set():
            raise InterruptedError('driver received a stop signal')
        if number + 1 < attempts:
            delay = (5, 15, 30)[number]
            event({'stage': stage, 'month': month, 'event': 'restart-backoff', 'seconds': delay})
            if STOP.wait(delay):
                raise InterruptedError('driver received a stop signal')
    raise RuntimeError(f'{stage} {month or "all"} stopped; inspect private logs before resuming')

def launch_detached():
    """Return only after the detached driver has acquired the run lock."""
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    log = DIRECTORY / 'logs' / f'driver-{stamp}-{uuid.uuid4()}.log'
    with log.open('ab') as out:
        process = subprocess.Popen(['nice', '-n', '10', str(LAB / '.venv/bin/python'),
            str(PROJECT / 'run_phase2.py'), '--reviewed'], cwd=LAB,
            stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True)
    status_path = DIRECTORY / 'driver.json'
    for _ in range(100):
        if status_path.exists():
            status = json.loads(status_path.read_text())
            if status.get('pid') == process.pid:
                print(json.dumps({**status, 'log': str(log.relative_to(LAB))}))
                return
        if process.poll() is not None:
            raise RuntimeError(f'detached driver exited {process.returncode}; inspect {log.relative_to(LAB)}')
        time.sleep(0.05)
    raise RuntimeError(f'driver readiness not confirmed; inspect {log.relative_to(LAB)} before another launch')

def main():
    global RUN_LOCK_FD
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--reviewed', action='store_true')
    ap.add_argument('--detach', action='store_true', help='launch with private file logs in a new session')
    args = ap.parse_args()
    if not args.reviewed:
        ap.error('use --reviewed after the reviewer authorizes the run')
    verify_manifest()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    (DIRECTORY / 'logs').mkdir(exist_ok=True)
    if args.detach:
        launch_detached()
        return
    signal.signal(signal.SIGTERM, signal_stop)
    signal.signal(signal.SIGINT, signal_stop)
    with (DIRECTORY / 'run.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Stage parents retain the same lock if the supervisor is killed;
        # a resume cannot launch duplicate workers while they still run.
        RUN_LOCK_FD = lock.fileno()
        status = {'pid': os.getpid(), 'startedAt': datetime.now(timezone.utc).isoformat(),
                  'status': 'running', 'datasetKind': 'amended',
                  'manifestSha256': hashlib.sha256((PROJECT / 'phase2-manifest.json').read_bytes()).hexdigest()}
        atomic_json(DIRECTORY / 'driver.json', status)
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                streams = {month: executor.submit(run_stage, 'stream', month) for month in MONTHS}
                try:
                    for month in MONTHS:
                        streams[month].result()
                        run_stage('backfill', month)
                        run_stage('positions', month)
                except BaseException:
                    signal_stop(None, None)
                    for future in streams.values():
                        future.cancel()
                    raise
            for month in MONTHS:
                run_stage('score', month)
            run_stage('analysis', None)
        except BaseException:
            atomic_json(DIRECTORY / 'driver.json', {**status, 'status': 'stopped',
                'finishedAt': datetime.now(timezone.utc).isoformat(),
                'stopReason': 'signal' if SIGNAL_RECEIVED else 'stage-failure'})
            raise
        atomic_json(DIRECTORY / 'driver.json', {**status, 'status': 'complete',
            'finishedAt': datetime.now(timezone.utc).isoformat()})
        print('Amended analysis complete. Stop before the answer and paper.', flush=True)

if __name__ == '__main__':
    main()
