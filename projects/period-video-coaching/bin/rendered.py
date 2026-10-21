#!/usr/bin/env python3
"""Each first run's video length as the app renders it (bin/rendered.mts: the app's
plan, its Kokoro voice and its timeline), written to <run>/rendered.json. No model
call; the voice runs on the CPU. Added after the result, deciding nothing: the
period video grammar gives its minutes in this length.

  rendered.py --configs baseline,coach-moves [--venv /tmp/kokoro-venv] [--cache <dir>]
"""
import json, os, subprocess, sys, time

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, opt  # noqa: E402
from batch import IDS, run_dir  # noqa: E402


def main():
    configs = (opt('--configs') or 'baseline,coach-moves').split(',')
    venv = opt('--venv') or os.environ.get('KOKORO_VENV') or os.path.join(EVAL, 'kokoro-venv')
    cache = opt('--cache') or os.environ.get('COACH_CACHE_DIR') or os.path.join(EVAL, 'coach-cache')
    env = {**os.environ, 'PATH': os.path.join(venv, 'bin') + os.pathsep + os.environ['PATH'], 'COACH_CACHE_DIR': cache}
    for config in configs:
        for i in IDS:
            d = run_dir(config, i, 1)
            out = os.path.join(d, 'rendered.json')
            if not os.path.isfile(os.path.join(d, 'grade.json')) or os.path.isfile(out):
                continue
            work = os.path.join(EVAL, 'render-work', f'{config}-{i}')
            t = time.time()
            p = subprocess.run([os.path.join(d, 'repo', 'node_modules', '.bin', 'tsx'), os.path.join(BIN, 'rendered.mts'), i, work],
                               cwd=os.path.join(d, 'repo'), env=env, capture_output=True, text=True, timeout=3600)
            if p.returncode != 0:
                print(f'{config} {i}: failed {p.stderr.strip()[-400:]}', flush=True)
                continue
            row = json.loads(p.stdout.strip().splitlines()[-1])
            row['wallSeconds'] = round(time.time() - t)
            json.dump(row, open(out, 'w'), indent=1)
            subprocess.run(['rm', '-rf', work])
            print(f'{config} {i}: {json.dumps(row)}', flush=True)


if __name__ == '__main__':
    main()
