#!/usr/bin/env python3
"""The aggregates the repository keeps: results/report.json (the rule as
`batch.py report` computed it, the cases, the spend and the usage windows) and
results/runs.json (each run's numbers, each day's judge verdicts, the controls,
the audits' counts and tallies, and the audit of each published script when one
was run). No quote, game, opponent or position from a review leaves the eval
directory. A later candidate (round 2's lesson-moves-2) writes
results/report-<config>.json and results/runs-<config>.json beside them.

  export.py [--config lesson-moves --vs baseline]
"""
import json, os, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, PROJECT, ledger, load, opt, spoken_seconds  # noqa: E402
from batch import BASELINE, CANDIDATE, CRITERIA, HELD_OUT, IDS, MIN_DECOY_WORDS, TRAIN, case_dir, decoy_paths, decoy_tag, run_dir  # noqa: E402


def audit_row(a):
    if not a or 'counts' not in a:
        return None
    return {'counts': a['counts'], 'tally': a['tally'], 'seconds': a.get('seconds'), 'cost': round(a.get('cost') or 0, 2)}


def run_row(config, i):
    d = run_dir(config, i)
    g = load(os.path.join(d, 'grade.json'))
    if not g:
        return None
    u = g.get('usage') or {}
    verdicts = g.get('verdicts') or {}
    return {'config': config, 'id': i, 'pass': g['final'].get('ok'), 'finalErrors': g['final'].get('errors'),
            'finalWarnings': g['final'].get('warnings'), 'rounds': g.get('rounds'), 'firstDraft': g.get('firstDraft'),
            'wroteVideo': g.get('wroteVideo'), 'wroteAnnotations': g.get('wroteAnnotations'), 'otherFiles': len(g.get('otherFiles') or []),
            'shape': g.get('shape'), 'forbidden': sorted(g.get('forbidden') or {}), 'teachCalls': g.get('teachCalls'),
            'verdictLines': verdicts.get('lines'), 'lessonLinks': g.get('lessonLinks'),
            'minutes': round((g.get('seconds') or 0) / 60, 1), 'cost': round(u.get('cost') or 0, 2), 'turns': u.get('turns'),
            'windows': {n: v for n, v in (g.get('windows') or {}).items() if n != 'statuses'},
            'audit': audit_row(load(os.path.join(d, 'audit.json')))}


def verdict(path):
    j = load(path)
    if not j or 'final' not in j:
        return None
    return {'final': j['final'], 'orders': [{**{c: r[c] for c in CRITERIA}, 'order': r['order']} for r in j['rounds']], 'cost': round(j.get('cost') or 0, 2)}


def case_row(config, i):
    c = load(os.path.join(case_dir(config, i), 'meta', 'case.json'))
    if not c:
        return None
    return {'usable': c.get('usable'), 'games': c.get('games'), 'code': c.get('code'), 'data': c.get('parent'),
            'referenceCheckExit': c.get('referenceCheckExit'),
            'published': audit_row(load(os.path.join(case_dir(config, i), 'meta', 'audit-published.json')))}


def main():
    config, other = opt('--config', CANDIDATE), opt('--vs', BASELINE)
    report = load(os.path.join(EVAL, 'reports', f'{config}-vs-{other}.json'))
    if not report:
        sys.exit('no report yet: run batch.py report first')
    cases = {}
    for i in IDS:
        rows = {c: case_row(c, i) for c in (other, config)}
        if any(rows.values()):
            cases[i] = {'split': 'train' if i in TRAIN else 'heldOut', **rows}
    codes = {c: sorted({r[c]['code'] for r in cases.values() if r.get(c) and r[c].get('code')}) for c in (other, config)}
    runs = [r for i in IDS for r in (run_row(c, i) for c in (other, config)) if r]
    pairs = []
    for i in IDS:
        v = verdict(os.path.join(run_dir(config, i), f'judge-vs-{other}.json'))
        if v:
            pairs.append({'id': i, 'candidate': v})
    controls = {}
    for i in IDS:
        base = run_dir(other, i)
        decoy_script, decoy_judged = decoy_paths(base, i, decoy_tag(config))
        c = {'same': verdict(os.path.join(base, 'judge-control-same.json')), 'decoy': verdict(decoy_judged)}
        rep = load(os.path.join(os.path.dirname(decoy_script), 'report.json'))
        if rep:
            beats = rep.get('beats') or []
            c['decoyText'] = {'target': rep.get('target'), 'added': rep.get('added'), 'beats': len(beats),
                              'clean': sum(1 for b in beats if b.get('clean')), 'kept': sum(1 for b in beats if b.get('kept'))}
        if any(c.values()):
            controls[i] = c
    spend = {}
    windows = [r['windows'] for r in ledger() if r.get('windows') and r['windows'].get('seven_day') is not None]
    for r in ledger():
        if r.get('kind') != 'hold':
            spend[r['kind']] = round(spend.get(r['kind'], 0) + (r.get('cost') or 0), 2)
    out = os.path.join(PROJECT, 'results')
    os.makedirs(out, exist_ok=True)
    meta = {'configs': {other: codes[other], config: codes[config]}, 'cases': cases, 'train': TRAIN, 'heldOut': HELD_OUT,
            'writer': 'claude-opus-5-5', 'graders': 'claude-sonnet-5-5',
            'method': {'wordsPerSecond': spoken_seconds.__defaults__[0], 'minDecoyWords': MIN_DECOY_WORDS}}
    usage = {'sevenDay': {'first': windows[0]['seven_day'] if windows else None, 'last': windows[-1]['seven_day'] if windows else None}}
    suffix = '' if config == CANDIDATE else f'-{config}'
    extra = {}
    if suffix:
        starts = [(load(os.path.join(run_dir(config, i), 'run.json')) or {}).get('started') for i in IDS]
        first = min((t for t in starts if t), default=None)
        mine = [r for r in ledger() if first and r.get('t', 0) >= first and r.get('kind') != 'hold']
        extra = {'round': {'firstWriter': first, 'spent': round(sum(r.get('cost') or 0 for r in mine), 2),
                           'sevenDay': {'first': next((r['windows']['seven_day'] for r in mine if (r.get('windows') or {}).get('seven_day') is not None), None),
                                        'last': next((r['windows']['seven_day'] for r in reversed(mine) if (r.get('windows') or {}).get('seven_day') is not None), None)}}}
    json.dump({**meta, 'report': report, 'spend': spend, 'spent': round(sum(spend.values()), 2), 'usage': usage, **extra},
              open(os.path.join(out, f'report{suffix}.json'), 'w'), indent=1)
    json.dump({**meta, 'runs': runs, 'pairs': pairs, 'controls': controls}, open(os.path.join(out, f'runs{suffix}.json'), 'w'), indent=1)
    print(json.dumps({'runs': len(runs), 'pairs': len(pairs), 'kept': report.get('kept'), 'spent': round(sum(spend.values()), 2)}))


if __name__ == '__main__':
    main()
