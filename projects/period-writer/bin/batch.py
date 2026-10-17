#!/usr/bin/env python3
"""Run the weekly and monthly writer eval under its spend cap and usage guard.

  batch.py runs --config NAME [--variant variants/X.json] [--jobs 2] [ID...]   writer runs, graded and audited
  batch.py judge --config NAME --vs OTHER [--jobs 3] [ID...]                   the blind pairwise judge, both orders
  batch.py controls --config NAME --vs OTHER [ID...]                          the judge's same-text and decoy controls
  batch.py published [ID...]                                                  audit each landed review against today's brief
  batch.py report --config NAME --vs OTHER                                    the pre-registered comparison
  batch.py spend                                                              the ledger's total and the usage windows

Every step skips work already done. Runs live in <eval>/runs/<config>/<id>/r1;
progress goes to <eval>/logs/batch-<config>.log. No writer starts when the
ledger plus what is still owed would pass the cap, when the subscription's
five-hour window is past its bar or its seven-day window past its own, or in
the hours around the daily routine (and the weekly on Mondays), so the live
routines keep their room.
"""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, PROJECT, boot, latest_windows, ledger, load, opt, record, spent, windows_of  # noqa: E402

CAP = float(os.environ.get('EVAL_CAP', '250'))
FIVE_HOUR_BAR = float(os.environ.get('EVAL_FIVE_HOUR_BAR', '0.45'))
SEVEN_DAY_BAR = float(os.environ.get('EVAL_SEVEN_DAY_BAR', '0.6'))
CASES = os.path.join(EVAL, 'cases')
RUNS = os.path.join(EVAL, 'runs')
LOGS = os.path.join(EVAL, 'logs')
TRAIN = ['2026-W35', '2026-W37', '2026-W39', '2026-W41', '2026-08']
HELD_OUT = ['2026-W36', '2026-W38', '2026-W40', '2026-09']
IDS = TRAIN + HELD_OUT
RESERVE_PER_RUN = 0.6
RESERVE_END = 15.0


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
            skip = True
            continue
        out.append(a)
    return out


def case_ready(i):
    c = load(os.path.join(CASES, i, 'meta', 'case.json'))
    return bool(c and c.get('usable'))


def kind_of(i):
    return 'weekly' if '-W' in i else 'monthly'


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


def expected_cost(kind):
    costs = [g['usage']['cost'] for g in (load(p) for p in grade_files()) if g and g.get('kind') == kind and (g.get('usage') or {}).get('cost')]
    if costs:
        return max(costs) * 1.15
    return 15.0 if kind == 'weekly' else 30.0


def grade_files():
    out = []
    if os.path.isdir(RUNS):
        for config in os.listdir(RUNS):
            for i in os.listdir(os.path.join(RUNS, config)):
                p = os.path.join(RUNS, config, i, 'r1', 'grade.json')
                if os.path.exists(p):
                    out.append(p)
    return out


def may_start(kind, owed_runs):
    """Why a writer may not start now, or None."""
    need = expected_cost(kind) + RESERVE_PER_RUN * owed_runs + RESERVE_END
    if spent() + need > CAP:
        return f'cap: spent {spent()} + owed {round(need, 2)} would pass {CAP}'
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


def cmd_runs(args):
    config = opt('--config', argv=args)
    variant = opt('--variant', argv=args)
    jobs = int(opt('--jobs', 2, argv=args))
    ids = [i for i in (positional(args) or IDS) if case_ready(i)]
    prompts = {}
    if variant:
        out = os.path.join(EVAL, 'variants', config)
        subprocess.run([sys.executable, os.path.join(BIN, 'variant.py'), os.path.join(PROJECT, variant) if not os.path.isabs(variant) else variant, out], check=True)
        prompts = {k: os.path.join(out, f'{k}.md') for k in ('weekly', 'monthly')}
    todo = [i for i in ids if not os.path.exists(os.path.join(RUNS, config, i, 'r1', 'grade.json'))]

    def one(i):
        run = os.path.join(RUNS, config, i, 'r1')
        kind = kind_of(i)
        while True:
            owed = sum(1 for x in todo if not os.path.exists(os.path.join(RUNS, config, x, 'r1', 'grade.json')))
            why = may_start(kind, owed)
            if why is None:
                break
            if why.startswith('cap') or why.startswith('seven-day'):
                log(config, f'{i}: not started, {why}')
                return
            log(config, f'{i}: waiting, {why}')
            time.sleep(600)
        env = dict(os.environ)
        if kind in prompts:
            env['PROMPT'] = prompts[kind]
        log(config, f'{i}: writing')
        p = subprocess.run([os.path.join(BIN, 'run-writer.sh'), os.path.join(CASES, i), run], capture_output=True, text=True, env=env)
        log(config, f'{i}: {p.stdout.strip()[-200:] or p.stderr.strip()[-300:]}')
        g = subprocess.run([sys.executable, os.path.join(BIN, 'grade.py'), os.path.join(CASES, i), run], capture_output=True, text=True)
        log(config, f'{i}: grade {g.stdout.strip() or g.stderr.strip()[-300:]}')
        gr = load(os.path.join(run, 'grade.json')) or {}
        record('writer', f'{config} {i}', (gr.get('usage') or {}).get('cost'), gr.get('windows') and {k: (v or {}).get('last') for k, v in gr['windows'].items() if k != 'statuses'}, gr.get('model'))
        if not os.path.exists(os.path.join(run, 'audit.json')):
            a = subprocess.run([sys.executable, os.path.join(BIN, 'audit.py'), os.path.join(CASES, i), run], capture_output=True, text=True)
            log(config, f'{i}: audit {a.stdout.strip() or a.stderr.strip()[-300:]}')

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, todo))
    for i in ids:
        run = os.path.join(RUNS, config, i, 'r1')
        if os.path.exists(os.path.join(run, 'grade.json')) and not os.path.exists(os.path.join(run, 'audit.json')):
            a = subprocess.run([sys.executable, os.path.join(BIN, 'audit.py'), os.path.join(CASES, i), run], capture_output=True, text=True)
            log(config, f'{i}: audit {a.stdout.strip() or a.stderr.strip()[-300:]}')
    log(config, f'batch done, spent {spent()}')


def cmd_judge(args):
    config, other = opt('--config', argv=args), opt('--vs', argv=args)
    jobs = int(opt('--jobs', 3, argv=args))
    ids = positional(args) or IDS

    def one(i):
        a, b = os.path.join(RUNS, config, i, 'r1'), os.path.join(RUNS, other, i, 'r1')
        if not (os.path.isdir(a) and os.path.isdir(b)) or os.path.exists(os.path.join(a, f'judge-vs-{other}.json')):
            return
        j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), os.path.join(CASES, i), a, '--against', b], capture_output=True, text=True)
        log(config, f'{i} vs {other}: {j.stdout.strip() or j.stderr.strip()[-300:]}')

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, ids))


def words_of_boards(ann):
    import re
    out = [len(re.findall(r"[A-Za-z0-9'’]+", re.sub(r'<[^>]+>', ' ', b.get('prose') or ''))) for s in ann.get('sections') or [] for b in s.get('boards') or [] if b.get('prose')]
    return sum(out) / len(out) if out else None


def cmd_controls(args):
    """The same review on both sides, and a decoy as long as the candidate's exhibits, on the baseline runs."""
    config, other = opt('--config', argv=args), opt('--vs', argv=args)
    ids = positional(args) or IDS
    for i in ids:
        base = os.path.join(RUNS, other, i, 'r1')
        cand = os.path.join(RUNS, config, i, 'r1')
        ann_b = load(os.path.join(base, 'out', 'coach-log', 'review-annotations', f'{i}.json'))
        ann_c = load(os.path.join(cand, 'out', 'coach-log', 'review-annotations', f'{i}.json'))
        if not ann_b:
            continue
        if not os.path.exists(os.path.join(base, 'judge-control-same.json')):
            j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), os.path.join(CASES, i), base, '--control', 'same'], capture_output=True, text=True)
            log(other, f'{i} control same: {j.stdout.strip() or j.stderr.strip()[-300:]}')
        wb, wc = words_of_boards(ann_b), words_of_boards(ann_c) if ann_c else None
        ratio = max(1.25, (wc / wb) if (wb and wc) else 1.3)
        if not os.path.exists(os.path.join(base, 'decoy', f'{i}.json')):
            d = subprocess.run([sys.executable, os.path.join(BIN, 'decoy.py'), os.path.join(CASES, i), base, '--ratio', f'{ratio:.2f}'], capture_output=True, text=True)
            log(other, f'{i} decoy x{ratio:.2f}: {d.stdout.strip() or d.stderr.strip()[-300:]}')
        if os.path.exists(os.path.join(base, 'decoy', f'{i}.json')) and not os.path.exists(os.path.join(base, 'judge-control-decoy.json')):
            j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), os.path.join(CASES, i), base, '--control', 'decoy'], capture_output=True, text=True)
            log(other, f'{i} control decoy: {j.stdout.strip() or j.stderr.strip()[-300:]}')


def cmd_published(args):
    for i in [i for i in (positional(args) or IDS) if case_ready(i)]:
        if os.path.exists(os.path.join(CASES, i, 'meta', 'audit-published.json')):
            continue
        a = subprocess.run([sys.executable, os.path.join(BIN, 'audit.py'), os.path.join(CASES, i), '--published'], capture_output=True, text=True)
        log('published', f'{i}: audit {a.stdout.strip() or a.stderr.strip()[-300:]}')


SCORE = {'candidate': 1.0, 'reference': -1.0, 'tie': 0.0}


def cmd_report(args):
    config, other = opt('--config', argv=args), opt('--vs', argv=args)
    rows = {}
    for i in IDS:
        a, b = os.path.join(RUNS, config, i, 'r1'), os.path.join(RUNS, other, i, 'r1')
        rows[i] = {'grade': load(os.path.join(a, 'grade.json')), 'gradeBase': load(os.path.join(b, 'grade.json')),
                   'audit': load(os.path.join(a, 'audit.json')), 'auditBase': load(os.path.join(b, 'audit.json')),
                   'judge': load(os.path.join(a, f'judge-vs-{other}.json')),
                   'same': load(os.path.join(b, 'judge-control-same.json')), 'decoy': load(os.path.join(b, 'judge-control-decoy.json'))}

    def split(ids, f):
        out = {}
        for i in ids:
            r = rows.get(i)
            v = f(r) if r else None
            if v is not None:
                out[i] = [v]
        return boot(out)

    def judged(c):
        return lambda r: SCORE[r['judge']['final'][c]] if r['judge'] and 'final' in r['judge'] else None

    def audit_diff(f):
        return lambda r: (f(r['audit']) - f(r['auditBase'])) if (r['audit'] and r['auditBase'] and 'counts' in r['audit'] and 'counts' in r['auditBase']) else None

    def rate_full(a):
        return a['exhibitsFullOrder'] / a['exhibits'] if a.get('exhibits') else None

    def per_exhibit_false(a):
        return a['boardClaimsFalse'] / a['exhibits'] if a.get('exhibits') else 0.0

    rep = {'config': config, 'vs': other, 'spent': spent()}
    for name, ids in [('train', TRAIN), ('heldOut', HELD_OUT), ('all', IDS)]:
        part = {}
        for c in ['truth', 'explanation', 'duties', 'plain', 'overall']:
            part[f'judge.{c}'] = split(ids, judged(c))
        part['audit.false.minusBase'] = split(ids, audit_diff(lambda a: a['counts']['false']))
        part['audit.falseOrMisleading.minusBase'] = split(ids, audit_diff(lambda a: a['counts']['false'] + a['counts']['misleading']))
        part['audit.boardClaimsFalse.minusBase'] = split(ids, audit_diff(lambda a: a['boardClaimsFalse']))
        part['audit.fullOrderRate'] = split(ids, lambda r: rate_full(r['audit']) if r['audit'] and 'counts' in r['audit'] else None)
        part['audit.fullOrderRate.base'] = split(ids, lambda r: rate_full(r['auditBase']) if r['auditBase'] and 'counts' in r['auditBase'] else None)
        part['pass'] = split(ids, lambda r: 1.0 if r['grade'] and r['grade']['final'].get('ok') else (0.0 if r['grade'] else None))
        part['pass.base'] = split(ids, lambda r: 1.0 if r['gradeBase'] and r['gradeBase']['final'].get('ok') else (0.0 if r['gradeBase'] else None))
        part['cost'] = split(ids, lambda r: (r['grade'].get('usage') or {}).get('cost') if r['grade'] else None)
        part['cost.base'] = split(ids, lambda r: (r['gradeBase'].get('usage') or {}).get('cost') if r['gradeBase'] else None)
        rep[name] = part
    rep['controls'] = {
        'same': {i: r['same']['final'] for i, r in rows.items() if r['same'] and 'final' in r['same']},
        'decoy': {i: r['decoy']['final'] for i, r in rows.items() if r['decoy'] and 'final' in r['decoy']},
    }
    expl = lambda part: part.get('judge.explanation')
    above = lambda b: bool(b and b['lo'] > 0)
    not_above = lambda b: not (b and b['lo'] > 0)
    decoy_wins = sum(1 for f in rep['controls']['decoy'].values() if f.get('explanation') == 'candidate')
    same_wins = sum(1 for f in rep['controls']['same'].values() for c in ('truth', 'explanation', 'duties', 'plain', 'overall') if f.get(c) != 'tie')
    rep['rule'] = {
        'explanationTrain': above(expl(rep['train'])),
        'explanationHeldOut': above(expl(rep['heldOut'])),
        'overallNotWorse': not (rep['all'].get('judge.overall') and rep['all']['judge.overall']['hi'] < 0),
        'falseNotUp': not_above(rep['all'].get('audit.false.minusBase')) and not_above(rep['all'].get('audit.boardClaimsFalse.minusBase')),
        'passNotDown': (rep['all']['pass'] or {}).get('est', 0) >= (rep['all']['pass.base'] or {}).get('est', 0),
        'controlsClean': same_wins == 0 and decoy_wins <= len(rep['controls']['decoy']) // 4,
    }
    rep['kept'] = all(rep['rule'].values())
    os.makedirs(os.path.join(EVAL, 'reports'), exist_ok=True)
    json.dump(rep, open(os.path.join(EVAL, 'reports', f'{config}-vs-{other}.json'), 'w'), indent=1)
    print(json.dumps(rep, indent=1))


def cmd_spend(args):
    rows = ledger()
    by = {}
    for r in rows:
        by[r['kind']] = round(by.get(r['kind'], 0) + (r.get('cost') or 0), 2)
    print(json.dumps({'spent': spent(), 'byKind': by, 'cap': CAP, 'windows': latest_windows()}, indent=1))


if __name__ == '__main__':
    cmd = sys.argv[1]
    {'runs': cmd_runs, 'judge': cmd_judge, 'controls': cmd_controls, 'published': cmd_published, 'report': cmd_report, 'spend': cmd_spend}[cmd](sys.argv[2:])
