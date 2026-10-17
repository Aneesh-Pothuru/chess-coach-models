#!/usr/bin/env python3
"""Pointwise audit of one weekly or monthly review against the evidence it was written from.

  audit.py <case-dir> <run-dir> [--model claude-sonnet-5-5]
  audit.py <case-dir> --published [--model claude-sonnet-5-5]     the review that landed, against today's brief

The auditor reads the evidence (bin/evidence.mts: the brief without its bulk, the
period's games, the aggregate's digest, and every board exhibit as the archive and
the knowledge service read it) and the review, and returns two things:

1. claims: every claim in words that the evidence contradicts or does not carry
   (false, unsupported, misleading), as the daily writer eval's audit does;
2. exhibits: for each board exhibit, whether its prose names the threat on the
   board, says why the move played (or the tempting one) fails, and says what the
   better move keeps, in that order, and its claims about the board that the
   evidence contradicts.

Writes <run-dir>/audit.json, or <case-dir>/meta/audit-published.json.
"""
import json, os, subprocess, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, evidence, opt, review_of, rating_of  # noqa: E402

SYSTEM = """You audit one {kind} chess coaching review, written for one player rated about {rating} in rapid, against the evidence it was written from: the period's brief (every number the review may quote is one of its facts), the clock's turning points with his think times, the period's games one line each, the aggregate's digest, the earlier reviews it audits (a week's daily logs, or a month's weekly reviews), and for every board exhibit the position as the game archive replays it, what was played there and next, the engine's best move and its best reply, the threats on the board, the readings (loose pieces, kings, passed pawns) and what the move describer says each move does. A position's FEN is exact: read the pieces and their lines from it. Be exact and skeptical; do not reward style or length.

1. claims: every claim in words, anywhere in the review, that the evidence contradicts or does not carry. Check who stood better and by how much, what a move did or threatened, what a piece attacks or guards, material, results, which game and move, how many times something happened, what he did in practice, what a previous check or an earlier review found, and any pattern or trend claimed. Quote the review's words exactly (a short span), say what the evidence shows, and grade each: "false" (the evidence contradicts it), "unsupported" (the evidence does not carry it), or "misleading" (true in letter, wrong in what he will take from it). A claim you find the evidence carries is not listed at all, and neither is a matter of taste. A line the review labels as better is the engine's suggestion, not what happened; a claim that the game went that way is false.

2. exhibits: one entry per board exhibit in the review, in the order the review shows them (section id and the board's number in it). For each:
- threat: does the prose name what the opponent threatened or aimed at in that position (or what the move played walked into), concretely, by a piece and a square? true or false.
- refutation: does it say why the move played (or a tempting alternative it names) fails, by naming the reply that punishes it? true or false.
- keeps: does it say what the better move keeps, guards, gains or prevents, concretely (a square, a piece or a line)? true or false; null when the board shows no better move.
- inOrder: are the parts it gives in the order threat, then why the move fails, then what the better move keeps? true or false; null when fewer than two of the three are given.
- boardClaims: only the prose's claims about this position (what attacks, guards or blocks what, where a piece stands, what a move threatens or allows) that the position and the exhibit's evidence contradict, each quoted exactly with what they show. A claim that holds is never listed; an empty list when every board claim holds.

Answer with the JSON object only."""

SCHEMA = {
    'type': 'object',
    'properties': {
        'claims': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'quote': {'type': 'string'}, 'evidence': {'type': 'string'},
            'grade': {'type': 'string', 'enum': ['false', 'unsupported', 'misleading']}},
            'required': ['quote', 'evidence', 'grade']}},
        'exhibits': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'section': {'type': 'string'}, 'board': {'type': 'integer'},
            'threat': {'type': 'boolean'}, 'refutation': {'type': 'boolean'},
            'keeps': {'type': ['boolean', 'null']}, 'inOrder': {'type': ['boolean', 'null']},
            'boardClaims': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'quote': {'type': 'string'}, 'evidence': {'type': 'string'}}, 'required': ['quote', 'evidence']}}},
            'required': ['section', 'board', 'threat', 'refutation', 'keeps', 'inOrder', 'boardClaims']}},
        'notes': {'type': 'string'},
    },
    'required': ['claims', 'exhibits', 'notes'],
}


def main():
    case = sys.argv[1]
    published = '--published' in sys.argv
    run = None if published else sys.argv[2]
    model = opt('--model', 'claude-sonnet-5-5')
    meta = json.load(open(os.path.join(case, 'meta', 'case.json')))
    rid, kind = meta['id'], meta['kind']
    if published:
        ann = os.path.join(case, 'meta', 'published-annotations.json')
        out = os.path.join(case, 'meta', 'audit-published.json')
    else:
        ann = os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{rid}.json')
        out = os.path.join(run, 'audit.json')
    if not os.path.exists(ann):
        json.dump({'id': rid, 'missing': True}, open(out, 'w'))
        print('missing annotations')
        return
    ev = evidence(case, rid, {'R': ann})
    prompt = (f'The {kind} review {rid}.\n\nThe evidence:\n{ev}\n\n'
              f'The review (JSON):\n{json.dumps(review_of(ann), ensure_ascii=False)}\n')
    verdict, cost = ask(model, SYSTEM.format(kind=kind, rating=rating_of(case, rid)), SCHEMA, prompt)
    counts = {g: sum(1 for c in verdict['claims'] if c.get('grade') == g) for g in ('false', 'unsupported', 'misleading')}
    ex = verdict['exhibits']
    board_false = sum(len(e.get('boardClaims') or []) for e in ex)
    full = sum(1 for e in ex if e.get('threat') and e.get('refutation') and e.get('keeps') and e.get('inOrder'))
    result = {'id': rid, 'kind': kind, 'model': model, 'published': published, 'counts': counts,
              'exhibits': len(ex), 'exhibitsFullOrder': full, 'boardClaimsFalse': board_false,
              'verdict': verdict, 'cost': cost}
    json.dump(result, open(out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({'id': rid, 'published': published, **counts, 'exhibits': len(ex), 'fullOrder': full, 'boardFalse': board_false, 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
