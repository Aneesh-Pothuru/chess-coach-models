#!/usr/bin/env python3
"""Run the daily video eval under its spend cap and usage guard.

  batch.py runs --configs baseline,coach-moves --variant coach-moves=variants/coach-moves.json [--reps 1] [--jobs 2] [ID...]
  batch.py runs --configs baseline --reps 2 --null [--jobs 2]                the noise floor's second baseline runs, on NULL_DAYS
  batch.py audit --configs baseline,coach-moves [--jobs 3] [ID...]          the pointwise audit of every graded run
  batch.py judge --config NAME --vs OTHER [--jobs 3] [ID...]                 the blind pairwise judge, both orders
  batch.py controls --config NAME --vs OTHER [ID...]                         the judge's same-text and decoy controls on OTHER's runs
  batch.py published [ID...]                                                 audit each published video against its case's brief
  batch.py report --config NAME --vs OTHER                                   the pre-registered comparison (README)
  batch.py spend                                                             the ledger's total and the usage windows

Every step skips work already done. Runs live in <eval>/runs/<config>/<id>/r<k>;
progress goes to <eval>/logs/batch-<config>.log. No writer starts when the
ledger plus what is still owed would pass the cap (EVAL_CAP), when the
subscription's five-hour window is past its bar or its seven-day window past its
own, or in the hours around the daily routine (and the weekly on Mondays), so
the live routines keep their room.
"""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, PROJECT, boot, latest_windows, ledger, load, opt, record, spent, windows_of  # noqa: E402

CAP = float(os.environ.get('EVAL_CAP', '60'))
FIVE_HOUR_BAR = float(os.environ.get('EVAL_FIVE_HOUR_BAR', '0.45'))
SEVEN_DAY_BAR = float(os.environ.get('EVAL_SEVEN_DAY_BAR', '0.6'))
CASES = os.path.join(EVAL, 'cases')
RUNS = os.path.join(EVAL, 'runs')
LOGS = os.path.join(EVAL, 'logs')
DAYS = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
        '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
        '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18', '2026-10-19']
TRAIN = DAYS[0::2]
HELD_OUT = DAYS[1::2]
IDS = DAYS
NULL_DAYS = ['2026-09-25', '2026-09-27', '2026-09-29', '2026-09-28', '2026-09-30', '2026-10-02']
GRADE_PER_RUN = 2.0
RESERVE_END = 5.0
GRADING = ('grader', 'judge', 'decoy')
MIN_DECOY_WORDS = 40
CRITERIA = ['truth', 'coaching', 'listening', 'overall']
MOVES = ['openQuestion', 'habitNamed', 'replacement', 'thenWhat', 'level']
BARE = {'--null'}


def log(config, msg):
    os.makedirs(LOGS, exist_ok=True)
    line = f'{time.strftime("%H:%M:%S")} {msg}'
    with open(os.path.join(LOGS, f'batch-{config}.log'), 'a') as f:
        f.write(line + '\n')
    print(line, flush=True)


def positional(args):
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        if a.startswith('--'):
            skip = a not in BARE
            continue
        out.append(a)
    return out


def case_ready(i):
    c = load(os.path.join(CASES, i, 'meta', 'case.json'))
    return bool(c and c.get('usable'))


def probe():
    """The usage windows now, from a one-word answer on the smallest model."""
    p = subprocess.run([os.path.join(BIN, 'claude-clean.sh'), '/tmp', '--model', 'claude-haiku-5-5', '--output-format', 'stream-json', '--verbose',
                        '--tools', '', '--max-turns', '1', '--no-session-persistence'], input='Reply with the word ok.', capture_output=True, text=True, timeout=300)
    windows, cost = None, 0.0
    for line in p.stdout.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get('type') == 'rate_limit_event':
            windows = windows_of(ev.get('rate_limit_info'))
        elif ev.get('type') == 'result':
            cost = ev.get('total_cost_usd') or 0.0
    record('probe', 'usage probe', cost, windows, 'claude-haiku-5-5')
    return windows


def quiet_hours(now=None):
    """The daily fires at 13:05 UTC and lands by about 15:30; the weekly fires Mondays at 13:00."""
    now = now or datetime.now(timezone.utc)
    h = now.hour + now.minute / 60
    end = 16.5 if now.weekday() == 0 else 14.75
    return 11.5 <= h < end


def expected_cost():
    costs = [g['usage']['cost'] for g in (load(p) for p in grade_files()) if g and (g.get('usage') or {}).get('cost')]
    if costs:
        return max(costs) * 1.15
    return 12.0


def grade_files():
    out = []
    if os.path.isdir(RUNS):
        for config in os.listdir(RUNS):
            for i in os.listdir(os.path.join(RUNS, config)):
                d = os.path.join(RUNS, config, i)
                for r in os.listdir(d) if os.path.isdir(d) else []:
                    p = os.path.join(d, r, 'grade.json')
                    if os.path.exists(p):
                        out.append(p)
    return out


def in_flight(skip=None):
    """The runs a batch holds now: a lock and no grade yet."""
    out = []
    if os.path.isdir(RUNS):
        for config in os.listdir(RUNS):
            for i in os.listdir(os.path.join(RUNS, config)):
                d = os.path.join(RUNS, config, i)
                for f in os.listdir(d) if os.path.isdir(d) else []:
                    run = os.path.join(d, f[:-5])
                    if f.endswith('.lock') and run != skip and not os.path.exists(os.path.join(run, 'grade.json')):
                        out.append((i, run))
    return out


def owed(configs, ids, rep, run):
    """Room the ledger must keep if this run starts: its writing and grading, the runs in flight, the grading
    the written runs still owe, and on a later rep every first rep not yet written, so each case gets a pair first."""
    held = in_flight(skip=run)
    need = expected_cost() + GRADE_PER_RUN + RESERVE_END
    need += sum(expected_cost() + GRADE_PER_RUN for _ in held)
    written = GRADE_PER_RUN * len(grade_files())
    graded = sum(r.get('cost') or 0.0 for r in ledger() if r.get('kind') in GRADING)
    need += max(0.0, written - graded)
    if rep > 1:
        busy = {r for _, r in held} | {run}
        need += sum(expected_cost() + GRADE_PER_RUN for c in configs for i in ids
                    if run_dir(c, i, 1) not in busy and not os.path.exists(os.path.join(run_dir(c, i, 1), 'grade.json')))
    return need


def may_start(configs, ids, rep, run):
    """Why a writer may not start now, or None."""
    need = owed(configs, ids, rep, run)
    if spent() + need > CAP:
        return f'cap: spent {spent()} + owed {round(need, 2)} would pass {CAP}'
    return room()


def room():
    """Why no model call should start now, or None: the live routines' hours and the usage bars."""
    if quiet_hours():
        return 'quiet hours around the live routines'
    w = probe() or latest_windows() or {}
    if w.get('five_hour') is None or w.get('seven_day') is None:
        return 'usage windows unreadable'
    if w['seven_day'] >= SEVEN_DAY_BAR:
        return f"seven-day window at {w['seven_day']} (bar {SEVEN_DAY_BAR})"
    if w['five_hour'] >= FIVE_HOUR_BAR:
        return f"five-hour window at {w['five_hour']} (bar {FIVE_HOUR_BAR})"
    return None


def wait_room(tag, what):
    """Waits until a grading call may start; False when the seven-day window says stop."""
    while True:
        why = room()
        if why is None:
            return True
        if why.startswith('seven-day'):
            log(tag, f'{what}: not started, {why}')
            return False
        log(tag, f'{what}: waiting, {why}')
        time.sleep(600)


def run_dir(config, i, rep):
    return os.path.join(RUNS, config, i, f'r{rep}')


def video_of(run, i):
    return load(os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{i}.video.json'))


def cmd_runs(args):
    """Writer runs, graded without a model: --configs a,b with --variant b=variants/b.json, interleaved by case and rep."""
    configs = (opt('--configs', argv=args) or opt('--config', argv=args)).split(',')
    variants = dict(v.split('=', 1) for v in (opt('--variant', argv=args) or '').split(',') if '=' in v)
    reps = int(opt('--reps', 1, argv=args))
    jobs = int(opt('--jobs', 2, argv=args))
    asked = positional(args) or (NULL_DAYS if '--null' in args else [])
    ids = [i for i in (asked or IDS) if case_ready(i)]
    prompts = {}
    for config, variant in variants.items():
        out = os.path.join(EVAL, 'variants', config)
        spec = variant if os.path.isabs(variant) else os.path.join(PROJECT, variant)
        subprocess.run([sys.executable, os.path.join(BIN, 'variant.py'), spec, out], check=True)
        prompts[config] = os.path.join(out, 'daily.md')
    order = ids if asked else [i for pair in zip(TRAIN, HELD_OUT + [None]) for i in pair if i in ids]
    todo = [(c, i, k) for k in range(1, reps + 1) for i in order for c in configs
            if not os.path.exists(os.path.join(run_dir(c, i, k), 'grade.json'))]
    tag = '+'.join(configs)
    log(tag, f'{len(todo)} runs to do: ' + ', '.join(f'{c} {i} r{k}' for c, i, k in todo))

    def one(item):
        config, i, k = item
        run = run_dir(config, i, k)
        os.makedirs(os.path.dirname(run), exist_ok=True)
        lock = run + '.lock'
        try:
            os.close(os.open(lock, os.O_CREAT | os.O_EXCL))
        except FileExistsError:
            log(tag, f'{config} {i} r{k}: another batch has it')
            return
        try:
            if os.path.exists(os.path.join(run, 'grade.json')):
                return
            go(config, i, k, run)
        finally:
            os.remove(lock)

    def go(config, i, k, run):
        while True:
            why = may_start(configs, ids, k, run)
            if why is None:
                break
            if why.startswith('cap') or why.startswith('seven-day'):
                log(tag, f'{config} {i} r{k}: not started, {why}')
                return
            log(tag, f'{config} {i} r{k}: waiting, {why}')
            time.sleep(600)
        env = dict(os.environ)
        if config in prompts:
            env['PROMPT'] = prompts[config]
        log(tag, f'{config} {i} r{k}: writing')
        p = subprocess.run([os.path.join(BIN, 'run-writer.sh'), os.path.join(CASES, i), run], capture_output=True, text=True, env=env)
        log(tag, f'{config} {i} r{k}: {p.stdout.strip()[-200:] or p.stderr.strip()[-300:]}')
        g = subprocess.run([sys.executable, os.path.join(BIN, 'grade.py'), os.path.join(CASES, i), run], capture_output=True, text=True)
        log(tag, f'{config} {i} r{k}: grade {g.stdout.strip() or g.stderr.strip()[-300:]}')
        gr = load(os.path.join(run, 'grade.json')) or {}
        last = {n: (v or {}).get('last') for n, v in (gr.get('windows') or {}).items() if n != 'statuses'}
        record('writer', f'{config} {i} r{k}', (gr.get('usage') or {}).get('cost'), last or None, gr.get('model'))

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, todo))
    log(tag, f'batch done, spent {spent()}')


def cmd_audit(args):
    """The pointwise audit of every graded run of the configs that has none yet."""
    configs = (opt('--configs', argv=args) or opt('--config', argv=args)).split(',')
    jobs = int(opt('--jobs', 3, argv=args))
    ids = positional(args) or IDS
    work = [(c, i, r) for c in configs for i in ids if os.path.isdir(os.path.join(RUNS, c, i)) for r in sorted(os.listdir(os.path.join(RUNS, c, i)))
            if os.path.exists(os.path.join(RUNS, c, i, r, 'grade.json')) and not os.path.exists(os.path.join(RUNS, c, i, r, 'audit.json'))]

    def one(item):
        c, i, r = item
        if not wait_room(c, f'{i} {r} audit'):
            return
        a = subprocess.run([sys.executable, os.path.join(BIN, 'audit.py'), os.path.join(CASES, i), os.path.join(RUNS, c, i, r)], capture_output=True, text=True)
        log(c, f'{i} {r}: audit {a.stdout.strip() or a.stderr.strip()[-300:]}')

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, work))


def cmd_judge(args):
    """Rep k of a config against rep k of the other; a config against itself pairs rep k with rep k+1 (the noise floor)."""
    config, other = opt('--config', argv=args), opt('--vs', argv=args)
    jobs = int(opt('--jobs', 3, argv=args))
    ids = positional(args) or IDS
    work = []
    for i in ids:
        for k in range(1, 10):
            a = run_dir(config, i, k)
            b = run_dir(other, i, k + 1 if other == config else k)
            if os.path.exists(os.path.join(a, 'grade.json')) and os.path.exists(os.path.join(b, 'grade.json')) and not os.path.exists(os.path.join(a, f'judge-vs-{other}.json')):
                work.append((i, a, b))

    def one(item):
        i, a, b = item
        if not wait_room(config, f'{i} {os.path.basename(a)} judge'):
            return
        j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), os.path.join(CASES, i), a, '--against', b], capture_output=True, text=True)
        log(config, f'{i} {os.path.basename(a)} vs {other} {os.path.basename(b)}: {j.stdout.strip() or j.stderr.strip()[-300:]}')

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, work))


def spoken_words(run):
    g = load(os.path.join(run, 'grade.json')) or {}
    return (g.get('shape') or {}).get('words')


def cmd_controls(args):
    """On OTHER's first rep: its script on both sides, and a decoy that adds as many spoken words as the candidate added."""
    config, other = opt('--config', argv=args), opt('--vs', argv=args)
    ids = positional(args) or IDS
    for i in ids:
        base = run_dir(other, i, 1)
        cand = run_dir(config, i, 1)
        if not video_of(base, i):
            continue
        owed_files = [f for f in ('judge-control-same.json', 'judge-control-decoy.json') if not os.path.exists(os.path.join(base, f))]
        if not owed_files or not wait_room(other, f'{i} controls'):
            continue
        if not os.path.exists(os.path.join(base, 'judge-control-same.json')):
            j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), os.path.join(CASES, i), base, '--control', 'same'], capture_output=True, text=True)
            log(other, f'{i} control same: {j.stdout.strip() or j.stderr.strip()[-300:]}')
        wb, wc = spoken_words(base), spoken_words(cand)
        if not (wb and wc):
            continue
        extra = max(MIN_DECOY_WORDS, wc - wb)
        if not os.path.exists(os.path.join(base, 'decoy', f'{i}.video.json')):
            d = subprocess.run([sys.executable, os.path.join(BIN, 'decoy.py'), os.path.join(CASES, i), base, '--words', str(extra)], capture_output=True, text=True)
            log(other, f'{i} decoy +{extra} words: {d.stdout.strip() or d.stderr.strip()[-300:]}')
        if os.path.exists(os.path.join(base, 'decoy', f'{i}.video.json')) and not os.path.exists(os.path.join(base, 'judge-control-decoy.json')):
            j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), os.path.join(CASES, i), base, '--control', 'decoy'], capture_output=True, text=True)
            log(other, f'{i} control decoy: {j.stdout.strip() or j.stderr.strip()[-300:]}')


def cmd_published(args):
    for i in [i for i in (positional(args) or IDS) if case_ready(i)]:
        if os.path.exists(os.path.join(CASES, i, 'meta', 'audit-published.json')):
            continue
        if not wait_room('published', f'{i} audit'):
            return
        a = subprocess.run([sys.executable, os.path.join(BIN, 'audit.py'), os.path.join(CASES, i), '--published'], capture_output=True, text=True)
        log('published', f'{i}: audit {a.stdout.strip() or a.stderr.strip()[-300:]}')


SCORE = {'candidate': 1.0, 'reference': -1.0, 'tie': 0.0}


def share(t, keys=MOVES):
    made = sum((t.get(k) or [0, 0])[0] for k in keys)
    owe = sum((t.get(k) or [0, 0])[1] for k in keys)
    return made / owe if owe else None


def cmd_report(args):
    config, other = opt('--config', argv=args), opt('--vs', argv=args)
    rows = {}
    for i in IDS:
        reps = []
        for k in range(1, 10):
            a, b = run_dir(config, i, k), run_dir(other, i, k)
            if not os.path.isdir(a) and not os.path.isdir(b):
                break
            reps.append({'grade': load(os.path.join(a, 'grade.json')), 'gradeBase': load(os.path.join(b, 'grade.json')),
                         'audit': load(os.path.join(a, 'audit.json')), 'auditBase': load(os.path.join(b, 'audit.json')),
                         'judge': load(os.path.join(a, f'judge-vs-{other}.json')), 'null': load(os.path.join(b, f'judge-vs-{other}.json'))})
        b1 = run_dir(other, i, 1)
        rows[i] = {'reps': reps, 'same': load(os.path.join(b1, 'judge-control-same.json')), 'decoy': load(os.path.join(b1, 'judge-control-decoy.json'))}

    def mean(vs):
        vs = [v for v in vs if v is not None]
        return sum(vs) / len(vs) if vs else None

    def split(ids, f):
        """f maps one rep to a number or None; a case's value is the mean over its reps."""
        out = {}
        for i in ids:
            v = mean([f(r) for r in rows[i]['reps']])
            if v is not None:
                out[i] = [v]
        return boot(out)

    def judged(c, key='judge'):
        return lambda r: SCORE[r[key]['final'][c]] if r.get(key) and 'final' in r[key] else None

    def audited(r, k):
        return bool(r[k] and 'counts' in r[k])

    def audit_diff(f):
        def g(r):
            if not (audited(r, 'audit') and audited(r, 'auditBase')):
                return None
            a, b = f(r['audit']), f(r['auditBase'])
            return a - b if a is not None and b is not None else None
        return g

    def one(f, key):
        return lambda r: f(r[key]) if audited(r, key) else None

    def seconds(g):
        return (g.get('shape') or {}).get('seconds') if g else None

    rep = {'config': config, 'vs': other, 'spent': spent()}
    for name, ids in [('train', TRAIN), ('heldOut', HELD_OUT), ('all', IDS)]:
        part = {}
        for c in CRITERIA:
            part[f'judge.{c}'] = split(ids, judged(c))
            part[f'null.{c}'] = split(ids, judged(c, 'null'))
        false = lambda a: a['counts']['false']
        board = lambda a: a['tally']['boardClaimsFalse']
        coach = lambda a: share(a['tally'])
        part['audit.false'] = split(ids, one(false, 'audit'))
        part['audit.false.base'] = split(ids, one(false, 'auditBase'))
        part['audit.false.minusBase'] = split(ids, audit_diff(false))
        part['audit.boardClaimsFalse'] = split(ids, one(board, 'audit'))
        part['audit.boardClaimsFalse.base'] = split(ids, one(board, 'auditBase'))
        part['audit.boardClaimsFalse.minusBase'] = split(ids, audit_diff(board))
        part['audit.coachingShare'] = split(ids, one(coach, 'audit'))
        part['audit.coachingShare.base'] = split(ids, one(coach, 'auditBase'))
        part['audit.coachingShare.minusBase'] = split(ids, audit_diff(coach))
        for k in MOVES + ['openQuestionAll', 'levelTrue', 'praiseNamed']:
            part[f'audit.{k}'] = split(ids, one(lambda a, k=k: share(a['tally'], [k]), 'audit'))
            part[f'audit.{k}.base'] = split(ids, one(lambda a, k=k: share(a['tally'], [k]), 'auditBase'))
        part['pass'] = split(ids, lambda r: (1.0 if r['grade']['final'].get('ok') else 0.0) if r['grade'] else None)
        part['pass.base'] = split(ids, lambda r: (1.0 if r['gradeBase']['final'].get('ok') else 0.0) if r['gradeBase'] else None)
        part['rounds'] = split(ids, lambda r: r['grade'].get('rounds') if r['grade'] else None)
        part['rounds.base'] = split(ids, lambda r: r['gradeBase'].get('rounds') if r['gradeBase'] else None)
        part['seconds'] = split(ids, lambda r: seconds(r['grade']))
        part['seconds.base'] = split(ids, lambda r: seconds(r['gradeBase']))
        part['lengthRatio'] = split(ids, lambda r: (seconds(r['grade']) / seconds(r['gradeBase'])) if seconds(r['grade']) and seconds(r['gradeBase']) else None)
        part['cost'] = split(ids, lambda r: (r['grade'].get('usage') or {}).get('cost') if r['grade'] else None)
        part['cost.base'] = split(ids, lambda r: (r['gradeBase'].get('usage') or {}).get('cost') if r['gradeBase'] else None)
        part['minutes'] = split(ids, lambda r: (r['grade'].get('seconds') or 0) / 60 if r['grade'] else None)
        part['minutes.base'] = split(ids, lambda r: (r['gradeBase'].get('seconds') or 0) / 60 if r['gradeBase'] else None)
        rep[name] = part
    rep['controls'] = {
        'same': {i: r['same']['final'] for i, r in rows.items() if r['same'] and 'final' in r['same']},
        'decoy': {i: r['decoy']['final'] for i, r in rows.items() if r['decoy'] and 'final' in r['decoy']},
    }
    above = lambda b: bool(b and b['lo'] > 0)
    below = lambda b: bool(b and b['hi'] < 0)
    decoy_wins = sum(1 for f in rep['controls']['decoy'].values() if f.get('coaching') == 'candidate')
    same_wins = sum(1 for f in rep['controls']['same'].values() for c in CRITERIA if f.get(c) != 'tie')
    # An unrun or missing control is not a tie. Both controls are owed on every
    # usable day, including days a partial batch has not written yet.
    control_days = {i for i, r in rows.items() if case_ready(i) or r['reps']}
    controls_complete = bool(control_days) and all(control_days <= set(rep['controls'][kind]) for kind in ('same', 'decoy'))
    # The audit guards compare both first-run scripts on every day. A missing
    # audit must not silently drop that day from truth or coaching share.
    audits_complete = bool(control_days) and all(
        rows[i]['reps'] and all(audited(rows[i]['reps'][0], k) for k in ('audit', 'auditBase'))
        for i in control_days)
    null = rep['all'].get('null.coaching')
    ratio = rep['all'].get('lengthRatio')
    rep['rule'] = {
        '1 coaching better on train': above(rep['train'].get('judge.coaching')),
        '2 coaching better held out': above(rep['heldOut'].get('judge.coaching')),
        '3 overall not worse': not below(rep['all'].get('judge.overall')),
        '4 truth not worse': audits_complete and not above(rep['all'].get('audit.false.minusBase')) and not above(rep['all'].get('audit.boardClaimsFalse.minusBase')),
        '5 check passes as often': (rep['all']['pass'] or {}).get('est', 0) >= (rep['all']['pass.base'] or {}).get('est', 0),
        '6 controls clean': controls_complete and same_wins == 0 and decoy_wins <= len(rep['controls']['decoy']) // 4 and bool(null) and null['lo'] <= 0 <= null['hi'],
        '7 coaching moves made more often': audits_complete and above(rep['all'].get('audit.coachingShare.minusBase')),
        '8 not much longer': bool(ratio and ratio['est'] <= 1.3),
    }
    rep['kept'] = all(rep['rule'].values())
    os.makedirs(os.path.join(EVAL, 'reports'), exist_ok=True)
    json.dump(rep, open(os.path.join(EVAL, 'reports', f'{config}-vs-{other}.json'), 'w'), indent=1)
    print(json.dumps(rep, indent=1))


def cmd_spend(args):
    rows = ledger()
    by = {}
    for r in rows:
        if r.get('kind') != 'hold':
            by[r['kind']] = round(by.get(r['kind'], 0) + (r.get('cost') or 0), 2)
    print(json.dumps({'spent': spent(), 'byKind': by, 'cap': CAP, 'windows': latest_windows()}, indent=1))


if __name__ == '__main__':
    cmd = sys.argv[1]
    {'runs': cmd_runs, 'audit': cmd_audit, 'judge': cmd_judge, 'controls': cmd_controls, 'published': cmd_published, 'report': cmd_report, 'spend': cmd_spend}[cmd](sys.argv[2:])
