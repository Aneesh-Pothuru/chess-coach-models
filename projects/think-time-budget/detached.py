#!/usr/bin/env python3
"""Detach one project job, with private logs and a persistent completion record."""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import secrets
import shlex
import signal
import subprocess
import sys
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PRIVATE = LAB / 'private' / 'think-time-budget'
JOBS = PRIVATE / 'jobs'
PYTHON = LAB / '.venv' / 'bin' / 'python'
SCRIPTS = {'sample.py', 'cohort.py', 'run_build.py', 'analyze.py', 'cost.py',
           'facts.mjs', 'paper/generate.mjs'}


def record_path(name):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', name):
        raise ValueError('job names use lowercase letters, digits, underscores and hyphens')
    return JOBS / f'{name}.json'


def save(name, record):
    path = record_path(name)
    tmp = path.with_suffix('.partial')
    tmp.write_text(json.dumps(record, indent=2) + '\n')
    tmp.replace(path)


def command_for(script, arguments):
    if script not in SCRIPTS:
        raise ValueError(f'choose a project script: {", ".join(sorted(SCRIPTS))}')
    path = PROJECT / script
    if script.endswith('.py'):
        command = [str(PYTHON), str(path), *arguments]
    else:
        command = [str(LAB / 'bridge' / 'run.sh'), str(path), *arguments]
    # The bridge coordinator only waits; the sampler also counts cohorts itself.
    # Sampler children retain its low priority and each also starts via nice -n 10.
    if script != 'run_build.py':
        command = ['nice', '-n', '10', *command]
    return command


def running(record):
    pid = record.get('pid')
    if not pid or record.get('state') not in {'starting', 'running', 'stopping'}:
        return False
    result = subprocess.run(['ps', '-ww', '-p', str(pid), '-o', 'command='],
                            text=True, capture_output=True, check=False)
    words = shlex.split(result.stdout.strip()) if result.returncode == 0 else []
    return str(Path(__file__).resolve()) in words and '_worker' in words and record['token'] in words


def start(name, script, arguments):
    record_path(name)
    command_for(script, arguments)
    JOBS.mkdir(parents=True, exist_ok=True)
    with (PRIVATE / 'launcher.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('another detached project job is running; wait for it before starting another') from None
        token = secrets.token_hex(16)
        log_path = PRIVATE / f'{name}.log'
        record = {'name': name, 'token': token, 'state': 'starting',
                  'script': script, 'arguments': arguments,
                  'log': str(log_path.relative_to(LAB)), 'startedEpochSeconds': time.time()}
        save(name, record)
        environment = dict(os.environ, PYTHONUNBUFFERED='1', OMP_NUM_THREADS='1',
                           OPENBLAS_NUM_THREADS='1', VECLIB_MAXIMUM_THREADS='1')
        with log_path.open('ab') as log:
            log.write(('\n' + json.dumps({'detachedJob': name, 'script': script,
                                        'arguments': arguments}) + '\n').encode())
            log.flush()
            child = subprocess.Popen(
                ['nohup', str(PYTHON), str(Path(__file__).resolve()), '_worker',
                 name, token, str(lock.fileno()), script, *arguments],
                cwd=LAB, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True, pass_fds=(lock.fileno(),), env=environment)
        # The inherited open file description keeps the lock held by the worker.
        print(json.dumps({'name': name, 'pid': child.pid, 'log': record['log'],
                          'record': str(record_path(name).relative_to(LAB))}))


def worker(name, token, descriptor, script, arguments):
    lock = os.fdopen(int(descriptor), 'a')
    record = json.loads(record_path(name).read_text())
    if record['token'] != token:
        raise SystemExit('job record changed before startup')
    record.update(pid=os.getpid(), state='running')
    save(name, record)
    child = None
    stopping = False

    def request_stop(_signum, _frame):
        nonlocal stopping
        stopping = True
        record['state'] = 'stopping'
        save(name, record)
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGTERM)

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    code = 1
    try:
        if not stopping:
            child = subprocess.Popen(command_for(script, arguments), cwd=LAB,
                                     stdin=subprocess.DEVNULL)
            if stopping and child.poll() is None:
                child.send_signal(signal.SIGTERM)
            code = child.wait()
        else:
            code = 130
    finally:
        record.update(state='stopped' if stopping else ('complete' if code == 0 else 'failed'),
                      exitCode=code, endedEpochSeconds=time.time())
        save(name, record)
        lock.close()
    return code


def inspect(name):
    record = json.loads(record_path(name).read_text())
    alive = running(record)
    if (record['state'] in {'running', 'stopping'} and not alive) or (
            record['state'] == 'starting' and time.time() - record['startedEpochSeconds'] > 60):
        record['state'] = 'lost'
    return record, alive


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '_worker':
        return worker(*sys.argv[2:6], sys.argv[6:])
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='action', required=True)
    launch = sub.add_parser('start', help='start a detached job and return immediately')
    launch.add_argument('name')
    launch.add_argument('script', choices=sorted(SCRIPTS))
    launch.add_argument('arguments', nargs=argparse.REMAINDER)
    for action in ['status', 'wait', 'stop']:
        item = sub.add_parser(action)
        item.add_argument('name')
    args = ap.parse_args()
    if args.action == 'start':
        start(args.name, args.script, args.arguments)
        return 0
    while True:
        record, alive = inspect(args.name)
        if args.action == 'stop':
            if alive:
                os.kill(record['pid'], signal.SIGTERM)
            print(json.dumps({'name': args.name, 'stopRequested': alive, 'state': record['state']}))
            return 0 if alive or record['state'] in {'complete', 'stopped'} else 1
        if args.action == 'status' or record['state'] not in {'starting', 'running', 'stopping'}:
            print(json.dumps(record))
            if args.action == 'status':
                return 0
            return 0 if record['state'] == 'complete' and record.get('exitCode') == 0 else 1
        time.sleep(1)


if __name__ == '__main__':
    raise SystemExit(main())
