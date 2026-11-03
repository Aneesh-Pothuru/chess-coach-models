#!/usr/bin/env python3
"""Run the lesson-videos eval under its spend cap and usage guard.

  batch.py runs [--configs baseline,lesson-moves] [--jobs 2] [ID...]   one writer run per config and day, graded without a model
  batch.py audit [--configs baseline,lesson-moves] [--jobs 3] [ID...]  the pointwise audit of every graded run
  batch.py judge [--config lesson-moves --vs baseline] [--jobs 3] [ID...]  the blind pairwise judge, both orders
  batch.py controls [--config lesson-moves --vs baseline] [ID...]      the judge's same-text and decoy controls on the baseline's runs
  batch.py report [--config lesson-moves --vs baseline]                the pre-registered comparison (README)
  batch.py spend                                                        the ledger's total and the usage windows

A day has one case per config (<eval>/cases/<config>/<id>: the app at that
config's code with the coach data as it stood before the day landed) and one
run per config (<eval>/runs/<config>/<id>/r1). Every grader reads both runs of a
day against the baseline case's evidence, so both scripts are checked against
the same board. Every step skips work already done; progress goes to
<eval>/logs/batch-<config>.log. No writer starts when the ledger plus what is
still owed would pass the cap (EVAL_CAP), when the subscription's five-hour
window is past its bar or its seven-day window past its own, or in the hours
around the daily routine (and the weekly on Mondays), so the live routines keep
their room.
"""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, boot, latest_windows, ledger, load, opt, record, spent, windows_of  # noqa: E402

CAP = float(os.environ.get('EVAL_CAP', '216'))
FIVE_HOUR_BAR = float(os.environ.get('EVAL_FIVE_HOUR_BAR', '0.45'))
SEVEN_DAY_BAR = float(os.environ.get('EVAL_SEVEN_DAY_BAR', '0.6'))
CASES = os.path.join(EVAL, 'cases')
RUNS = os.path.join(EVAL, 'runs')
LOGS = os.path.join(EVAL, 'logs')
BASELINE, CANDIDATE = 'baseline', 'lesson-moves'
CONFIGS = [BASELINE, CANDIDATE]
DAYS = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18', '2026-10-19',
        '2026-10-20', '2026-10-22', '2026-10-24', '2026-10-25', '2026-10-27', '2026-10-28']
TRAIN = DAYS[0::2]
HELD_OUT = DAYS[1::2]
IDS = DAYS
FIRST_COST = 10.0
GRADE_PER_RUN = 2.0
RESERVE_END = 5.0
GRADING = ('grader', 'judge', 'decoy')
MIN_DECOY_WORDS = 40
CRITERIA = ['truth', 'coaching', 'listening', 'overall']
ASKED = ['aboutFirst', 'purposeNamed', 'takeaway']


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


def case_dir(config, i):
    return os.path.join(CASES, config, i)


def evidence_case(i):
    return case_dir(BASELINE, i)


def case_ready(i, configs=CONFIGS):
    return all(bool((load(os.path.join(case_dir(c, i), 'meta', 'case.json')) or {}).get('usable')) for c in configs)


def run_dir(config, i):
    return os.path.join(RUNS, config, i, 'r1')


def video_of(run, i):
    return load(os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{i}.video.json'))


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


def grade_files():
    out = []
    for config in CONFIGS:
        for i in IDS:
            p = os.path.join(run_dir(config, i), 'grade.json')
            if os.path.exists(p):
                out.append(p)
    return out


def expected_cost():
    costs = [g['usage']['cost'] for g in (load(p) for p in grade_files()) if g and (g.get('usage') or {}).get('cost')]
    return max(costs) * 1.15 if costs else FIRST_COST


def in_flight(skip=None):
    """The runs a batch holds now: a lock and no grade yet."""
    return [run_dir(c, i) for c in CONFIGS for i in IDS
            if run_dir(c, i) != skip and os.path.exists(run_dir(c, i) + '.lock') and not os.path.exists(os.path.join(run_dir(c, i), 'grade.json'))]


def owed(run):
    """Room the ledger must keep if this run starts: its writing and grading, the runs in flight, and the grading
    the written runs still owe."""
    need = expected_cost() + GRADE_PER_RUN + RESERVE_END
    need += sum(expected_cost() + GRADE_PER_RUN for _ in in_flight(skip=run))
    written = GRADE_PER_RUN * len(grade_files())
    graded = sum(r.get('cost') or 0.0 for r in ledger() if r.get('kind') in GRADING)
    return need + max(0.0, written - graded)


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


def may_start(run):
    """Why a writer may not start now, or None."""
    need = owed(run)
    if spent() + need > CAP:
        return f'cap: spent {spent()} + owed {round(need, 2)} would pass {CAP}'
    return room()


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


def cmd_runs(args):
    """Writer runs, each config at its own case of the day, in day order (train and held-out days interleaved)."""
    configs = (opt('--configs', argv=args) or ','.join(CONFIGS)).split(',')
    jobs = int(opt('--jobs', 2, argv=args))
    asked = positional(args)
    ids = [i for i in (asked or [i for pair in zip(TRAIN, HELD_OUT) for i in pair]) if case_ready(i)]
    todo = [(c, i) for i in ids for c in configs if not os.path.exists(os.path.join(run_dir(c, i), 'grade.json'))]
    tag = '+'.join(configs)
    log(tag, f'{len(todo)} runs to do: ' + ', '.join(f'{c} {i}' for c, i in todo))

    def one(item):
        config, i = item
        run = run_dir(config, i)
        os.makedirs(os.path.dirname(run), exist_ok=True)
        lock = run + '.lock'
        try:
            os.close(os.open(lock, os.O_CREAT | os.O_EXCL))
        except FileExistsError:
            log(tag, f'{config} {i}: another batch has it')
            return
        try:
            if not os.path.exists(os.path.join(run, 'grade.json')):
                go(config, i, run)
        finally:
            os.remove(lock)

    def go(config, i, run):
        while True:
            why = may_start(run)
            if why is None:
                break
            if why.startswith('cap') or why.startswith('seven-day'):
                log(tag, f'{config} {i}: not started, {why}')
                return
            log(tag, f'{config} {i}: waiting, {why}')
            time.sleep(600)
        log(tag, f'{config} {i}: writing')
        p = subprocess.run([os.path.join(BIN, 'run-writer.sh'), case_dir(config, i), run], capture_output=True, text=True)
        log(tag, f'{config} {i}: {p.stdout.strip()[-200:] or p.stderr.strip()[-300:]}')
        g = subprocess.run([sys.executable, os.path.join(BIN, 'grade.py'), case_dir(config, i), run], capture_output=True, text=True)
        log(tag, f'{config} {i}: grade {g.stdout.strip() or g.stderr.strip()[-300:]}')
        gr = load(os.path.join(run, 'grade.json')) or {}
        last = {n: (v or {}).get('last') for n, v in (gr.get('windows') or {}).items() if n != 'statuses'}
        record('writer', f'{config} {i}', (gr.get('usage') or {}).get('cost'), last or None, gr.get('model'))

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, todo))
    log(tag, f'batch done, spent {spent()}')


def cmd_audit(args):
    """The pointwise audit of every graded run of the configs that has none yet, against the baseline case's evidence."""
    configs = (opt('--configs', argv=args) or ','.join(CONFIGS)).split(',')
    jobs = int(opt('--jobs', 3, argv=args))
    ids = positional(args) or IDS
    work = [(c, i) for i in ids for c in configs
            if os.path.exists(os.path.join(run_dir(c, i), 'grade.json')) and not os.path.exists(os.path.join(run_dir(c, i), 'audit.json'))]

    def one(item):
        c, i = item
        if not wait_room(c, f'{i} audit'):
            return
        a = subprocess.run([sys.executable, os.path.join(BIN, 'audit.py'), evidence_case(i), run_dir(c, i)], capture_output=True, text=True)
        log(c, f'{i}: audit {a.stdout.strip() or a.stderr.strip()[-300:]}')

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, work))


def cmd_judge(args):
    """The candidate's run of a day against the baseline's run of the same day."""
    config, other = opt('--config', CANDIDATE, argv=args), opt('--vs', BASELINE, argv=args)
    jobs = int(opt('--jobs', 3, argv=args))
    ids = positional(args) or IDS
    work = [i for i in ids
            if all(os.path.exists(os.path.join(run_dir(c, i), 'grade.json')) for c in (config, other))
            and not os.path.exists(os.path.join(run_dir(config, i), f'judge-vs-{other}.json'))]

    def one(i):
        if not wait_room(config, f'{i} judge'):
            return
        j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), evidence_case(i), run_dir(config, i), '--against', run_dir(other, i)],
                           capture_output=True, text=True)
        log(config, f'{i} vs {other}: {j.stdout.strip() or j.stderr.strip()[-300:]}')

    with ThreadPoolExecutor(jobs) as ex:
        list(ex.map(one, work))


def spoken_words(run):
    g = load(os.path.join(run, 'grade.json')) or {}
    return (g.get('shape') or {}).get('words')


def cmd_controls(args):
    """On the baseline's run: its script on both sides, and a decoy that adds as many spoken words as the candidate added."""
    config, other = opt('--config', CANDIDATE, argv=args), opt('--vs', BASELINE, argv=args)
    ids = positional(args) or IDS
    for i in ids:
        base, cand = run_dir(other, i), run_dir(config, i)
        if not (video_of(base, i) and os.path.exists(os.path.join(cand, 'grade.json'))):
            continue
        owed_files = [f for f in ('judge-control-same.json', 'judge-control-decoy.json') if not os.path.exists(os.path.join(base, f))]
        if not owed_files or not wait_room(other, f'{i} controls'):
            continue
        if not os.path.exists(os.path.join(base, 'judge-control-same.json')):
            j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), evidence_case(i), base, '--control', 'same'], capture_output=True, text=True)
            log(other, f'{i} control same: {j.stdout.strip() or j.stderr.strip()[-300:]}')
        wb, wc = spoken_words(base), spoken_words(cand)
        if not (wb and wc):
            continue
        extra = max(MIN_DECOY_WORDS, wc - wb)
        if not os.path.exists(os.path.join(base, 'decoy', f'{i}.video.json')):
            d = subprocess.run([sys.executable, os.path.join(BIN, 'decoy.py'), evidence_case(i), base, '--words', str(extra)], capture_output=True, text=True)
            log(other, f'{i} decoy +{extra} words: {d.stdout.strip() or d.stderr.strip()[-300:]}')
        if os.path.exists(os.path.join(base, 'decoy', f'{i}.video.json')) and not os.path.exists(os.path.join(base, 'judge-control-decoy.json')):
            j = subprocess.run([sys.executable, os.path.join(BIN, 'judge.py'), evidence_case(i), base, '--control', 'decoy'], capture_output=True, text=True)
            log(other, f'{i} control decoy: {j.stdout.strip() or j.stderr.strip()[-300:]}')


SCORE = {'candidate': 1.0, 'reference': -1.0, 'tie': 0.0}


def rate(t, key):
    made, owe = t.get(key) or [0, 0]
    return made / owe if owe else None


def asked_share(t):
    made = sum((t.get(k) or [0, 0])[0] for k in ASKED)
    owe = sum((t.get(k) or [0, 0])[1] for k in ASKED)
    return made / owe if owe else None


def read_days(config, other):
    """Every day with both runs written: the days the rule reads."""
    rows = {}
    for i in IDS:
        a, b = run_dir(config, i), run_dir(other, i)
        g, gb = load(os.path.join(a, 'grade.json')), load(os.path.join(b, 'grade.json'))
        if not (g and gb):
            continue
        rows[i] = {'grade': g, 'gradeBase': gb,
                   'audit': load(os.path.join(a, 'audit.json')), 'auditBase': load(os.path.join(b, 'audit.json')),
                   'judge': load(os.path.join(a, f'judge-vs-{other}.json')),
                   'same': load(os.path.join(b, 'judge-control-same.json')), 'decoy': load(os.path.join(b, 'judge-control-decoy.json'))}
    return rows


def cmd_report(args):
    config, other = opt('--config', CANDIDATE, argv=args), opt('--vs', BASELINE, argv=args)
    rows = read_days(config, other)

    def split(ids, f):
        return boot({i: [v] for i in ids if i in rows for v in [f(rows[i])] if v is not None})

    def judged(c):
        return lambda r: SCORE[r['judge']['final'][c]] if r.get('judge') and 'final' in r['judge'] else None

    def audited(r, k):
        return bool(r[k] and 'counts' in r[k])

    def one(f, key):
        return lambda r: f(r[key]) if audited(r, key) else None

    def diff(f):
        def g(r):
            if not (audited(r, 'audit') and audited(r, 'auditBase')):
                return None
            a, b = f(r['audit']), f(r['auditBase'])
            return a - b if a is not None and b is not None else None
        return g

    def verdict_lines(g):
        v = g.get('verdicts') if g else None
        return v.get('lines') if isinstance(v, dict) and isinstance(v.get('lines'), int) else None

    def seconds(g):
        return (g.get('shape') or {}).get('seconds') if g else None

    def linked(g):
        n = (g.get('lessonLinks') or {}) if g else {}
        return n['withLesson'] / n['moments'] if n.get('moments') else None

    false = lambda a: a['counts']['false']
    board = lambda a: a['tally']['boardClaimsFalse']
    asked = lambda a: asked_share(a['tally'])
    unsound = lambda a: rate(a['tally'], 'unsound')
    rep = {'config': config, 'vs': other, 'spent': spent(), 'days': sorted(rows)}
    for name, ids in [('train', TRAIN), ('heldOut', HELD_OUT), ('all', IDS)]:
        part = {f'judge.{c}': split(ids, judged(c)) for c in CRITERIA}
        for key, f in [('false', false), ('boardClaimsFalse', board), ('askedShare', asked), ('unsound', unsound)]:
            part[f'audit.{key}'] = split(ids, one(f, 'audit'))
            part[f'audit.{key}.base'] = split(ids, one(f, 'auditBase'))
            part[f'audit.{key}.minusBase'] = split(ids, diff(f))
        for k in ['openQuestionAll', 'aboutFirst', 'purposeNamed', 'takeaway', 'lessonNamed', 'lessonFits', 'betterSound', 'engineRecital',
                  'thenWhat', 'habitNamed', 'replacement', 'praiseNamed']:
            part[f'audit.{k}'] = split(ids, one(lambda a, k=k: rate(a['tally'], k), 'audit'))
            part[f'audit.{k}.base'] = split(ids, one(lambda a, k=k: rate(a['tally'], k), 'auditBase'))
        part['audit.verdictScenes'] = split(ids, one(lambda a: a['tally'].get('verdictScenes'), 'audit'))
        part['audit.verdictScenes.base'] = split(ids, one(lambda a: a['tally'].get('verdictScenes'), 'auditBase'))
        part['verdictLines'] = split(ids, lambda r: verdict_lines(r['grade']))
        part['verdictLines.base'] = split(ids, lambda r: verdict_lines(r['gradeBase']))
        part['verdictLines.minusBase'] = split(ids, lambda r: (verdict_lines(r['grade']) - verdict_lines(r['gradeBase']))
                                               if verdict_lines(r['grade']) is not None and verdict_lines(r['gradeBase']) is not None else None)
        part['lessonLinked'] = split(ids, lambda r: linked(r['grade']))
        part['lessonLinked.base'] = split(ids, lambda r: linked(r['gradeBase']))
        part['pass'] = split(ids, lambda r: 1.0 if r['grade']['final'].get('ok') else 0.0)
        part['pass.base'] = split(ids, lambda r: 1.0 if r['gradeBase']['final'].get('ok') else 0.0)
        part['rounds'] = split(ids, lambda r: r['grade'].get('rounds'))
        part['rounds.base'] = split(ids, lambda r: r['gradeBase'].get('rounds'))
        part['teachCalls'] = split(ids, lambda r: r['grade'].get('teachCalls'))
        part['teachCalls.base'] = split(ids, lambda r: r['gradeBase'].get('teachCalls'))
        part['seconds'] = split(ids, lambda r: seconds(r['grade']))
        part['seconds.base'] = split(ids, lambda r: seconds(r['gradeBase']))
        part['lengthRatio'] = split(ids, lambda r: (seconds(r['grade']) / seconds(r['gradeBase'])) if seconds(r['grade']) and seconds(r['gradeBase']) else None)
        part['cost'] = split(ids, lambda r: (r['grade'].get('usage') or {}).get('cost'))
        part['cost.base'] = split(ids, lambda r: (r['gradeBase'].get('usage') or {}).get('cost'))
        part['minutes'] = split(ids, lambda r: (r['grade'].get('seconds') or 0) / 60)
        part['minutes.base'] = split(ids, lambda r: (r['gradeBase'].get('seconds') or 0) / 60)
        rep[name] = part
    rep['controls'] = {
        'same': {i: r['same']['final'] for i, r in rows.items() if r['same'] and 'final' in r['same']},
        'decoy': {i: r['decoy']['final'] for i, r in rows.items() if r['decoy'] and 'final' in r['decoy']},
    }
    above = lambda b: bool(b and b['lo'] > 0)
    below = lambda b: bool(b and b['hi'] < 0)
    days = set(rows)
    decoy_wins = sum(1 for f in rep['controls']['decoy'].values() if f.get('coaching') == 'candidate')
    same_wins = sum(1 for f in rep['controls']['same'].values() for c in CRITERIA if f.get(c) != 'tie')
    controls_complete = bool(days) and all(days <= set(rep['controls'][kind]) for kind in ('same', 'decoy'))
    audits_complete = bool(days) and all(audited(rows[i], k) for i in days for k in ('audit', 'auditBase'))
    judged_all = bool(days) and all(rows[i]['judge'] and 'final' in rows[i]['judge'] for i in days)
    verdicts_read = bool(days) and all(verdict_lines(rows[i][k]) is not None for i in days for k in ('grade', 'gradeBase'))
    ratio = rep['all'].get('lengthRatio')
    a = rep['all']
    rep['complete'] = {'judge': judged_all, 'audits': audits_complete, 'controls': controls_complete, 'verdicts': verdicts_read}
    rep['rule'] = {
        '1 coaching better on train': judged_all and above(rep['train'].get('judge.coaching')),
        '2 coaching better held out': judged_all and above(rep['heldOut'].get('judge.coaching')),
        '3 overall not worse': judged_all and not below(a.get('judge.overall')),
        '4 truth not worse': audits_complete and not above(a.get('audit.false.minusBase')) and not above(a.get('audit.boardClaimsFalse.minusBase')),
        '5 check passes as often': (a['pass'] or {}).get('est', 0) >= (a['pass.base'] or {}).get('est', 0),
        '6 controls clean': controls_complete and same_wins == 0 and decoy_wins <= len(rep['controls']['decoy']) // 4,
        '7 writing changed as asked': verdicts_read and audits_complete and below(a.get('verdictLines.minusBase')) and above(a.get('audit.askedShare.minusBase')),
        '8 not much longer': bool(ratio and ratio['est'] <= 1.3),
        '9 better moves as sound': audits_complete and not above(a.get('audit.unsound.minusBase')),
    }
    rep['kept'] = all(rep['rule'].values())
    os.makedirs(os.path.join(EVAL, 'reports'), exist_ok=True)
    json.dump(rep, open(os.path.join(EVAL, 'reports', f'{config}-vs-{other}.json'), 'w'), indent=1)
    print(json.dumps(rep, indent=1))


def cmd_spend(args):
    by = {}
    for r in ledger():
        if r.get('kind') != 'hold':
            by[r['kind']] = round(by.get(r['kind'], 0) + (r.get('cost') or 0), 2)
    print(json.dumps({'spent': spent(), 'byKind': by, 'cap': CAP, 'windows': latest_windows()}, indent=1))


if __name__ == '__main__':
    cmd = sys.argv[1]
    {'runs': cmd_runs, 'audit': cmd_audit, 'judge': cmd_judge, 'controls': cmd_controls, 'report': cmd_report, 'spend': cmd_spend}[cmd](sys.argv[2:])
