#!/usr/bin/env python3
"""Blind pairwise judge: one run's weekly or monthly review against another's.

  judge.py <case-dir> <run-dir> --against <other-run-dir> [--model claude-sonnet-5-5]
  judge.py <case-dir> <run-dir> --control same            the run's review on both sides (every criterion should tie)
  judge.py <case-dir> <run-dir> --control decoy           the run's decoy (bin/decoy.py) as the candidate, the run's review as the reference

Both reviews are shown as A and B, twice, in both orders. A side wins a criterion
only when it wins in both orders; anything else is a tie. The evidence is the
graders' (bin/evidence.mts) with both reviews' board exhibits. Writes
<run-dir>/judge-vs-<other config>.json, judge-control-same.json or judge-control-decoy.json.
"""
import json, os, random, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, evidence, opt, rating_of, review_of  # noqa: E402

CRITERIA = ['truth', 'explanation', 'duties', 'plain', 'overall']

SYSTEM = """You judge two versions of one {kind} chess coaching review, written for one player rated about {rating} in rapid from the same evidence. You see the evidence (the period's brief, whose facts hold every number a review may quote; the period's games one line each; the aggregate's digest; and every board exhibit of both reviews, with the position as the game archive replays it, what was played there and next, the engine's best move and best reply, the threats on the board, the readings and what the move describer says each move does) and two reviews, A and B, as JSON. Judge only what a careful coach would check. Length is not a virtue: prefer the review that is true, does its duties and is clear, and do not reward extra words.

Criteria, each answered "A", "B" or "tie":
- truth: every claim in words matches the evidence: who stood better and by how much, what a move did or threatened, what a piece attacks or guards, material, results, which game and move, counts and trends. A single false claim outweighs any amount of style; prefer the review with fewer and smaller misstatements.
- explanation: the board exhibits explain why the better move is better than the move played, in a way he can use at the board next time: what the opponent threatened or aimed at, why the move played (or the tempting one) fails, and what the better move keeps, each named concretely by piece, square or reply, and true to the position.
- duties: the review does the {kind} routine's work: it grades the previous focus and states the next one as a behaviour with numbers the next review checks, keeps practice, success in the exercises and transfer as separate claims, says credit and saves as praise, audits the earlier reviews it repeats, and synthesizes what repeated instead of re-teaching single games.
- plain: plain words a player at his level follows; no internal ids or keys (concept codes like K6, rule ids like R53, metric ids); short sentences.
- overall: which review you would rather he read, all of the above weighed, truth first.

Answer with the JSON object only."""

SCHEMA = {
    'type': 'object',
    'properties': {
        **{c: {'type': 'string', 'enum': ['A', 'B', 'tie']} for c in CRITERIA},
        'falseClaimsA': {'type': 'array', 'items': {'type': 'string'}},
        'falseClaimsB': {'type': 'array', 'items': {'type': 'string'}},
        'why': {'type': 'string'},
    },
    'required': CRITERIA + ['falseClaimsA', 'falseClaimsB', 'why'],
}


def main():
    case, run = sys.argv[1], sys.argv[2]
    model = opt('--model', 'claude-sonnet-5-5')
    control = opt('--control')
    against = opt('--against')
    meta = json.load(open(os.path.join(case, 'meta', 'case.json')))
    rid, kind = meta['id'], meta['kind']
    mine = os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{rid}.json')
    if control == 'same':
        files, name = {'candidate': mine, 'reference': mine}, 'judge-control-same.json'
    elif control == 'decoy':
        files, name = {'candidate': os.path.join(run, 'decoy', f'{rid}.json'), 'reference': mine}, 'judge-control-decoy.json'
    else:
        files = {'candidate': mine, 'reference': os.path.join(against, 'out', 'coach-log', 'review-annotations', f'{rid}.json')}
        name = f'judge-vs-{os.path.normpath(against).split(os.sep)[-3]}.json'
    out = os.path.join(run, name)
    missing = [k for k, f in files.items() if not os.path.exists(f)]
    if missing:
        json.dump({'id': rid, 'missing': missing[0]}, open(out, 'w'))
        print('missing annotations')
        return
    system = SYSTEM.format(kind=kind, rating=rating_of(case, rid))
    rounds, cost = [], 0.0
    for first in random.sample(['reference', 'candidate'], 2):
        second = 'candidate' if first == 'reference' else 'reference'
        ev = evidence(case, rid, {'A': files[first], 'B': files[second]})
        prompt = (f'The {kind} review {rid}.\n\nThe evidence:\n{ev}\n\n'
                  f'Review A (JSON):\n{json.dumps(review_of(files[first]), ensure_ascii=False)}\n\n'
                  f'Review B (JSON):\n{json.dumps(review_of(files[second]), ensure_ascii=False)}\n')
        verdict, c = ask(model, system, SCHEMA, prompt, label=f'judge {rid} {name}', kind='judge')
        cost += c
        named = {k: ({'A': first, 'B': second}.get(verdict[k], 'tie')) for k in CRITERIA}
        named['falseClaims'] = {first: verdict.get('falseClaimsA', []), second: verdict.get('falseClaimsB', [])}
        named['why'] = verdict.get('why', '')
        named['order'] = [first, second]
        rounds.append(named)
    final = {k: (rounds[0][k] if rounds[0][k] == rounds[1][k] else 'tie') for k in CRITERIA}
    result = {'id': rid, 'kind': kind, 'model': model, 'against': against, 'control': control, 'final': final, 'rounds': rounds, 'cost': cost}
    json.dump(result, open(out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({'id': rid, 'control': control, **final, 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
