#!/usr/bin/env python3
"""What the audited claims are about: each claim the audits list (false,
unsupported, misleading) and each false board claim, sorted into a fixed set of
kinds by one blind call per run (the sorter does not see which prompt wrote
the review), so the report can say which claims the reviews get wrong. The
sorter also marks an entry whose own evidence says the claim holds: the
auditor lists some of those despite its instructions, and the report counts
them apart.

  kinds.py --configs baseline,threat-order [--model claude-sonnet-5-5]

Writes <run-dir>/kinds.json beside each audit.json, and nothing else.
"""
import json, os, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, load, opt  # noqa: E402
from batch import RUNS  # noqa: E402

KINDS = {
    'count': 'how many games, times, days, moves or reviews; a tally or a share of a period',
    'result': 'a game result, a record (wins, losses, draws), a rating or a score',
    'board': 'what a piece attacks, guards, blocks or threatens; where a piece stands; material on the board',
    'engine': 'who stood better and by how much, which move was best, what an engine line does or shows',
    'earlier': 'what an earlier review, a daily log, a weekly review or a previous check said or found',
    'metric': "a skill's level, a metric's or a focus's reading, a grade, a target or a rule's state",
    'clock': 'time used, think times, the clock',
    'pattern': 'a habit, a repetition or a trend claimed across games',
    'other': 'anything else',
}

SYSTEM = ('You sort the claims a chess coaching review got wrong into kinds by what each claim is about. The kinds:\n'
          + '\n'.join(f'- {k}: {v}' for k, v in KINDS.items())
          + '\nGive each claim exactly one kind, the one its main point is about. Then say whether the evidence written beside it '
          'shows the quoted claim is in fact true (holds: true), as when it ends "this holds" or "that is fine" and names no part that is wrong; '
          'holds is false when the evidence names anything in the quote that is wrong or not carried. Answer with the JSON object only.')

SCHEMA = {'type': 'object', 'properties': {'kinds': {'type': 'array', 'items': {'type': 'object', 'properties': {
    'index': {'type': 'integer'}, 'kind': {'type': 'string', 'enum': list(KINDS)}, 'holds': {'type': 'boolean'}},
    'required': ['index', 'kind', 'holds']}}}, 'required': ['kinds']}


def main():
    configs = opt('--configs').split(',')
    model = opt('--model', 'claude-sonnet-5-5')
    for c in configs:
        for i in sorted(os.listdir(os.path.join(RUNS, c))):
            for r in sorted(os.listdir(os.path.join(RUNS, c, i))):
                d = os.path.join(RUNS, c, i, r)
                a = load(os.path.join(d, 'audit.json'))
                if not os.path.isdir(d) or not a or 'verdict' not in a or os.path.exists(os.path.join(d, 'kinds.json')):
                    continue
                items = [{'grade': x['grade'], 'quote': x['quote'], 'evidence': x['evidence']} for x in a['verdict']['claims']]
                items += [{'grade': 'board', 'quote': b['quote'], 'evidence': b['evidence']} for e in a['verdict']['exhibits'] for b in e.get('boardClaims') or []]
                if items:
                    prompt = '\n\n'.join(f'Claim {n}: "{x["quote"]}"\nWhat the evidence shows: {x["evidence"]}' for n, x in enumerate(items))
                    verdict, cost = ask(model, SYSTEM, SCHEMA, prompt, label=f'kinds {c} {i} {r}', kind='grader')
                    got = {k['index']: k for k in verdict['kinds']}
                else:
                    cost, got = 0.0, {}
                rows = [{'grade': x['grade'], 'kind': (got.get(n) or {}).get('kind', 'other'), 'holds': bool((got.get(n) or {}).get('holds'))}
                        for n, x in enumerate(items)]
                json.dump({'claims': rows, 'cost': cost}, open(os.path.join(d, 'kinds.json'), 'w'), indent=1)
                print(json.dumps({'config': c, 'id': i, 'rep': r, 'claims': len(rows), 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
