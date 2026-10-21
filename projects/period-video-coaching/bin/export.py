#!/usr/bin/env python3
"""The aggregates the repository keeps: results/report.json (the pre-registered
comparison, as `batch.py report` computed it, with the spend and the usage
windows) and results/runs.json (each run's numbers, each pair's verdicts, the
audits' counts and coaching tallies, and the audit of each published script).
No quote, game, opponent or position from a video leaves the eval directory.

  export.py --config coach-moves --vs baseline
"""
import json, os, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, PROJECT, ledger, load, opt, spoken_seconds  # noqa: E402
from batch import CASES, CRITERIA, HELD_OUT, IDS, MIN_DECOY_WORDS, TRAIN, run_dir  # noqa: E402


def audit_row(a):
    if not a or 'counts' not in a:
        return None
    return {'counts': a['counts'], 'tally': a['tally'], 'seconds': a.get('seconds'), 'cost': round(a.get('cost') or 0, 2)}


TOLD = ['habitNamed', 'replacement', 'level']


def told(video, audit):
    """Moments counted by the position they teach: consecutive board scenes on the same game and ply are one position
    told, and a move owed on every moment scene (the habit, its replacement, the level) counts as made when any of its
    scenes makes it. `split` counts the board scenes that repeat the position of the board scene just before them."""
    if not video or not audit or 'verdict' not in audit:
        return None
    kinds = {s.get('scene'): s for s in audit['verdict'].get('scenes') or []}
    groups, last = [], None
    for n, sc in enumerate(video.get('scenes') or [], 1):
        b = sc.get('board')
        if not b:
            last = None
            continue
        key = (b.get('game'), b.get('ply'), b.get('fen'))
        if key == last:
            groups[-1].append(n)
        else:
            groups.append([n])
        last = key
    out = {'split': sum(len(g) - 1 for g in groups), 'positions': 0, **{k: [0, 0] for k in TOLD}}
    for g in groups:
        rows = [kinds[n] for n in g if kinds.get(n, {}).get('kind') == 'moment']
        if not rows:
            continue
        out['positions'] += 1
        for k in TOLD:
            if any(r.get(k) is not None for r in rows):
                out[k][1] += 1
                out[k][0] += any(r.get(k) is True for r in rows)
    return out


def earlier(d, names):
    """The gradings set aside when the graders changed (README): graded-v1 is the first evidence, graded-v2 the second
    without the audit's holds grade."""
    out = {}
    for v in ('graded-v1', 'graded-v2'):
        row = {}
        for n in names:
            j = load(os.path.join(d, v, n))
            if not j:
                continue
            row[n.replace('.json', '')] = audit_row(j) if 'counts' in j else ({'final': j['final']} if 'final' in j else None)
        if row:
            out[v] = row
    return out or None


def run_row(config, i, k):
    d = run_dir(config, i, k)
    g = load(os.path.join(d, 'grade.json'))
    if not g:
        return None
    u = g.get('usage') or {}
    video = load(os.path.join(d, 'out', 'coach-log', 'review-annotations', f'{i}.video.json'))
    audit = load(os.path.join(d, 'audit.json'))
    return {'config': config, 'id': i, 'rep': k, 'pass': g['final'].get('ok'), 'finalErrors': g['final'].get('errors'),
            'finalWarnings': g['final'].get('warnings'), 'rounds': g.get('rounds'), 'firstDraft': g.get('firstDraft'),
            'wroteVideo': g.get('wroteVideo'), 'otherFiles': len(g.get('otherFiles') or []), 'shape': g.get('shape'),
            'forbidden': sorted(g.get('forbidden') or {}), 'minutes': round((g.get('seconds') or 0) / 60, 1),
            'cost': round(u.get('cost') or 0, 2), 'turns': u.get('turns'),
            'windows': {n: v for n, v in (g.get('windows') or {}).items() if n != 'statuses'},
            'audit': audit_row(audit), 'told': told(video, audit), 'rendered': rendered(d),
            'earlier': earlier(d, ['audit.json', 'judge-vs-baseline.json', 'judge-control-same.json', 'judge-control-decoy.json'])}


def rendered(d):
    """The video's length as the app renders it (bin/rendered.py), when it was timed."""
    r = load(os.path.join(d, 'rendered.json'))
    return {'seconds': r['seconds'], 'estimatedSeconds': r.get('estimatedSeconds'), 'voice': r.get('voice'), 'speed': r.get('speed')} if r else None


def verdict(path):
    j = load(path)
    if not j or 'final' not in j:
        return None
    return {'final': j['final'], 'orders': [{**{c: r[c] for c in CRITERIA}, 'order': r['order']} for r in j['rounds']], 'cost': round(j.get('cost') or 0, 2)}


def main():
    config, other = opt('--config'), opt('--vs')
    report = load(os.path.join(EVAL, 'reports', f'{config}-vs-{other}.json'))
    if not report:
        sys.exit('no report yet: run batch.py report first')
    cases = {}
    for i in IDS:
        c = load(os.path.join(CASES, i, 'meta', 'case.json'))
        if c:
            ref = load(os.path.join(CASES, i, 'meta', 'reference-check.json')) or {}
            cases[i] = {'kind': c.get('kind'), 'split': 'train' if i in TRAIN else 'heldOut', 'usable': c.get('usable'), 'games': c.get('games'),
                        'code': c.get('code'), 'data': c.get('parent'), 'referenceCheckExit': c.get('referenceCheckExit'),
                        'referenceErrors': len(ref['errors']) if isinstance(ref.get('errors'), list) else None,
                        'published': audit_row(load(os.path.join(CASES, i, 'meta', 'audit-published.json'))),
                        'publishedEarlier': earlier(os.path.join(CASES, i, 'meta'), ['audit-published.json']),
                        'publishedTold': told(load(os.path.join(CASES, i, 'meta', 'published-video.json')),
                                              load(os.path.join(CASES, i, 'meta', 'audit-published.json')))}
    codes = {c['code'] for c in cases.values() if c.get('code')}
    runs, pairs = [], []
    for i in IDS:
        for k in range(1, 10):
            rows = [r for r in (run_row(c, i, k) for c in (other, config)) if r]
            if not rows and not os.path.isdir(run_dir(other, i, k)):
                break
            runs += rows
            p = {'id': i, 'rep': k, 'candidate': verdict(os.path.join(run_dir(config, i, k), f'judge-vs-{other}.json')),
                 'null': verdict(os.path.join(run_dir(other, i, k), f'judge-vs-{other}.json'))}
            if p['candidate'] or p['null']:
                pairs.append(p)
    controls = {}
    for i in IDS:
        base = run_dir(other, i, 1)
        c = {'same': verdict(os.path.join(base, 'judge-control-same.json')), 'decoy': verdict(os.path.join(base, 'judge-control-decoy.json'))}
        rep = load(os.path.join(base, 'decoy', 'report.json'))
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
    meta = {'app': sorted(codes)[0] if len(codes) == 1 else sorted(codes), 'cases': cases, 'train': TRAIN, 'heldOut': HELD_OUT,
            'writer': 'claude-opus-5-5', 'graders': 'claude-sonnet-5-5',
            'method': {'wordsPerSecond': spoken_seconds.__defaults__[0], 'minDecoyWords': MIN_DECOY_WORDS}}
    usage = {'sevenDay': {'first': windows[0]['seven_day'] if windows else None, 'last': windows[-1]['seven_day'] if windows else None}}
    json.dump({**meta, 'report': report, 'spend': spend, 'spent': round(sum(spend.values()), 2), 'usage': usage},
              open(os.path.join(out, 'report.json'), 'w'), indent=1)
    json.dump({**meta, 'runs': runs, 'pairs': pairs, 'controls': controls}, open(os.path.join(out, 'runs.json'), 'w'), indent=1)
    print(json.dumps({'runs': len(runs), 'pairs': len(pairs), 'kept': report.get('kept'), 'spent': round(sum(spend.values()), 2)}))


if __name__ == '__main__':
    main()
