#!/usr/bin/env python3
"""Run two nice-10 bridge shards per month; keep logs and restart state private."""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import signal
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PRIVATE = LAB / 'private' / 'think-time-budget'


def stop_children(children):
    """Stop the bridge process groups and reap both children."""
    for child in children:
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for child in children:
        try:
            child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()


def build_month(month, per_budget):
    logs = PRIVATE / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    label = f'benchmark-{per_budget}' if per_budget else 'facts'
    children, handles, paths = [], [], []
    try:
        for shard in range(2):
            path = logs / f'{label}-{month}-{shard}of2.log'
            log = path.open('ab')
            handles.append(log)
            paths.append(str(path.relative_to(LAB)))
            command = ['nice', '-n', '10', str(LAB / 'bridge' / 'run.sh'),
                       'projects/think-time-budget/facts.mjs', '--month', month,
                       '--shard', f'{shard}/2', '--check', '20']
            if per_budget:
                command += ['--per-budget', str(per_budget)]
            log.write(('\n' + json.dumps({'command': command}) + '\n').encode())
            log.flush()
            children.append(subprocess.Popen(command, cwd=LAB, stdout=log, stderr=log,
                                             start_new_session=True))
        print(json.dumps({'month': month, 'stage': label, 'logs': paths,
                          'shards': 2, 'nice': 10}), flush=True)
        # Wait for both even if one exits unsuccessfully.
        codes = [child.wait() for child in children]
        print(json.dumps({'month': month, 'exitCodes': codes, 'logs': paths}), flush=True)
        return not any(codes)
    except BaseException:
        stop_children(children)
        raise
    finally:
        for log in handles:
            log.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--months', nargs='+', default=['2026-09', '2026-08'])
    ap.add_argument('--per-budget', type=int, default=0,
                    help='timing slice games per budget per shard; 0 builds all')
    args = ap.parse_args()
    if len(args.months) != len(set(args.months)) or not 1 <= len(args.months) <= 4:
        ap.error('give one to four distinct months')
    if any(not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month) for month in args.months):
        ap.error('months must be YYYY-MM')
    if args.per_budget < 0:
        ap.error('--per-budget must be nonnegative')
    missing = [m for m in args.months if not (PRIVATE / f'eligible-{m}.jsonl.gz').is_file()]
    if missing:
        ap.error(f"no frozen cohort export for {', '.join(missing)}; run sample.py or cohort.py --export first")
    PRIVATE.mkdir(parents=True, exist_ok=True)

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    with (PRIVATE / 'build.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('another think-time-budget bridge build holds build.lock') from None
        try:
            for month in args.months:
                if not build_month(month, args.per_budget):
                    print('Bridge build failed; completed chunks are retained. See the private logs.', file=sys.stderr)
                    return 1
        except KeyboardInterrupt:
            print('Bridge build interrupted; completed chunks are retained.', file=sys.stderr)
            return 130
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
