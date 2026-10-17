#!/usr/bin/env python3
"""The aggregates the repository keeps: results/report.json (the pre-registered
comparison, as `batch.py report` computed it) and results/runs.json (each run's
numbers, each pair's verdicts, the audits' counts by grade). No quote, game or
name from a review leaves the eval directory.

  export.py --config threat-order --vs baseline
"""
import json, os, re, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import EVAL, PROJECT, ledger, load, opt  # noqa: E402
from batch import CASES, HELD_OUT, IDS, RUNS, TRAIN, run_dir  # noqa: E402

CRITERIA = ['truth', 'explanation', 'duties', 'plain', 'overall']


def run_row(config, i, k):
    d = run_dir(config, i, k)
    g, a = load(os.path.join(d, 'grade.json')), load(os.path.join(d, 'audit.json'))
    if not g:
        return None
    row = {'config': config, 'id': i, 'rep': k, 'pass': g['final'].get('ok'), 'rounds': g.get('rounds'),
           'firstDraft': g.get('firstDraft'), 'boards': g.get('boards'), 'sections': g.get('sections'),
           'words': g.get('words'), 'forbidden': sorted(g.get('forbidden') or {}), 'minutes': round((g.get('seconds') or 0) / 60, 1),
           'cost': round((g.get('usage') or {}).get('cost') or 0, 2), 'turns': (g.get('usage') or {}).get('turns'),
           'windows': {n: v for n, v in (g.get('windows') or {}).items() if n != 'statuses'}}
    if a and 'counts' in a:
        ex = a['verdict']['exhibits']
        row['audit'] = {'counts': a['counts'], 'exhibits': len(ex), 'fullOrder': a['exhibitsFullOrder'],
                        'threat': sum(1 for e in ex if e.get('threat')), 'refutation': sum(1 for e in ex if e.get('refutation')),
                        'keeps': sum(1 for e in ex if e.get('keeps')), 'inOrder': sum(1 for e in ex if e.get('inOrder')),
                        'boardClaimsFalse': a['boardClaimsFalse'], 'cost': round(a.get('cost') or 0, 2)}
    brief = load(os.path.join(CASES, i, 'repo', 'coach-log', 'briefs', f'{i}.json')) or {}
    k5 = [x['id'] for x in (brief.get('ledger') or {}).get('live') or [] if x.get('concept') == 'K5']
    ann = load(os.path.join(d, 'out', 'coach-log', 'review-annotations', f'{i}.json'))
    if k5 == ['R53'] and ann:
        text = re.sub(r'<[^>]+>', ' ', json.dumps(ann, ensure_ascii=False))
        lists = [s for s in re.split(r'[.!?"]', text) if re.search(r'pawn breaks?\b', s, re.I) and re.search(r'loose pieces', s, re.I)]
        row['kingWalkCalledPawnBreak'] = bool(lists)
    kinds = load(os.path.join(d, 'kinds.json'))
    if kinds:
        tally, held = {}, {}
        for x in kinds['claims']:
            into = held if x.get('holds') else tally
            into.setdefault(x['grade'], {}).setdefault(x['kind'], 0)
            into[x['grade']][x['kind']] += 1
        row['kinds'], row['kindsHeld'] = tally, held
    return row


def verdict(path):
    j = load(path)
    if not j or 'final' not in j:
        return None
    return {'final': j['final'], 'orders': [{c: r[c] for c in CRITERIA} for r in j['rounds']], 'cost': round(j.get('cost') or 0, 2)}


def main():
    config, other = opt('--config'), opt('--vs')
    report = load(os.path.join(EVAL, 'reports', f'{config}-vs-{other}.json'))
    if not report:
        sys.exit('no report yet: run batch.py report first')
    cases = {}
    for i in IDS:
        c = load(os.path.join(CASES, i, 'meta', 'case.json'))
        if c:
            cases[i] = {'kind': c['kind'], 'split': 'train' if i in TRAIN else 'heldOut', 'games': c['games'], 'code': c['code'],
                        'data': c['parent'], 'frozenBrief': c['frozenBrief']}
    codes = {c['code'] for c in cases.values()}
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
    controls = {i: {'same': verdict(os.path.join(run_dir(other, i, 1), 'judge-control-same.json')),
                    'decoy': verdict(os.path.join(run_dir(other, i, 1), 'judge-control-decoy.json'))} for i in IDS}
    for i, c in controls.items():
        rep = load(os.path.join(run_dir(other, i, 1), 'decoy', 'report.json'))
        if rep:
            ex = rep.get('exhibits') or []
            c['decoyText'] = {'ratio': rep.get('ratio'), 'exhibits': len(ex), 'kept': sum(1 for e in ex if e.get('kept')),
                              'words': sum(e['words'] for e in ex), 'decoyWords': sum(e['decoyWords'] or 0 for e in ex if e.get('kept'))
                              + sum(e['words'] for e in ex if not e.get('kept'))}
    spend = {}
    for r in ledger():
        if r.get('kind') != 'hold':
            spend[r['kind']] = round(spend.get(r['kind'], 0) + (r.get('cost') or 0), 2)
    out = os.path.join(PROJECT, 'results')
    os.makedirs(out, exist_ok=True)
    meta = {'app': sorted(codes)[0] if len(codes) == 1 else sorted(codes), 'cases': cases, 'train': TRAIN, 'heldOut': HELD_OUT,
            'writer': 'claude-opus-5-5', 'graders': 'claude-sonnet-5-5'}
    json.dump({**meta, 'report': report, 'spend': spend, 'spent': round(sum(spend.values()), 2)},
              open(os.path.join(out, 'report.json'), 'w'), indent=1)
    json.dump({**meta, 'runs': runs, 'pairs': pairs, 'controls': controls}, open(os.path.join(out, 'runs.json'), 'w'), indent=1)
    print(json.dumps({'runs': len(runs), 'pairs': len(pairs), 'kept': report.get('kept'), 'spent': round(sum(spend.values()), 2)}))


if __name__ == '__main__':
    main()
