#!/usr/bin/env python3
"""A decoy of a run's review for the judge's length control: every board exhibit's
prose restated at a set length with nothing new in it (no square, move or piece
the original does not name), the rest of the review unchanged.

  decoy.py <case-dir> <run-dir> --ratio R [--model claude-sonnet-5-5]

R is how much longer each exhibit's prose gets (the candidate's mean exhibit
length over the baseline's on the case). Writes <run-dir>/decoy/<id>.json, and
<run-dir>/decoy/report.json with each exhibit's word counts and whether it
passed the nothing-new check (a failing exhibit keeps its original prose).
"""
import copy, json, os, re, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, opt  # noqa: E402

SYSTEM = """You rewrite short chess coaching paragraphs to a given length without adding anything. For each paragraph: keep every claim it makes and its HTML tags (<b>, <i>, <br>), and restate what it already says until it reaches about the target number of words. Add no new chess content: no square, move, piece, plan, threat or reason it does not already state, and no new numbers. Keep sentences short and plain. Answer with the JSON object only."""

SCHEMA = {'type': 'object', 'properties': {'paragraphs': {'type': 'array', 'items': {'type': 'object', 'properties': {
    'index': {'type': 'integer'}, 'text': {'type': 'string'}}, 'required': ['index', 'text']}}}, 'required': ['paragraphs']}

SQUARE = re.compile(r'\b[a-h][1-8]\b')
SAN = re.compile(r'\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|O-O(?:-O)?)\b')
PIECE = re.compile(r'\b(king|queen|rook|bishop|knight|pawn)s?\b', re.I)
NUMBER = re.compile(r'\b\d+(?:\.\d+)?\b')


def words(s):
    return len(re.findall(r"[A-Za-z0-9'’]+", re.sub(r'<[^>]+>', ' ', s or '')))


def tokens(s):
    t = re.sub(r'<[^>]+>', ' ', s or '')
    return set(SQUARE.findall(t)) | set(SAN.findall(t)) | {p.lower() for p in PIECE.findall(t)} | set(NUMBER.findall(t))


def main():
    case, run = sys.argv[1], sys.argv[2]
    ratio = float(opt('--ratio', '1.3'))
    model = opt('--model', 'claude-sonnet-5-5')
    rid = json.load(open(os.path.join(case, 'meta', 'case.json')))['id']
    src = os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{rid}.json')
    ann = json.load(open(src))
    spots = [(si, bi, b.get('prose') or '') for si, s in enumerate(ann.get('sections') or []) for bi, b in enumerate(s.get('boards') or []) if b.get('prose')]
    os.makedirs(os.path.join(run, 'decoy'), exist_ok=True)
    if not spots:
        json.dump(ann, open(os.path.join(run, 'decoy', f'{rid}.json'), 'w'), ensure_ascii=False)
        json.dump({'id': rid, 'exhibits': [], 'ratio': ratio}, open(os.path.join(run, 'decoy', 'report.json'), 'w'))
        print(json.dumps({'id': rid, 'exhibits': 0}))
        return
    prompt = 'Rewrite each paragraph to about its target length.\n\n' + '\n\n'.join(
        f'Paragraph {i}, target {max(words(p) + 6, round(words(p) * ratio))} words:\n{p}' for i, (_, _, p) in enumerate(spots))
    verdict, cost = ask(model, SYSTEM, SCHEMA, prompt, label=f'decoy {rid}', kind='decoy')
    got = {p['index']: p['text'] for p in verdict['paragraphs']}
    out, report = copy.deepcopy(ann), []
    for i, (si, bi, p) in enumerate(spots):
        new = got.get(i)
        ok = bool(new) and tokens(new) <= tokens(p)
        if ok:
            out['sections'][si]['boards'][bi]['prose'] = new
        report.append({'section': ann['sections'][si].get('id'), 'board': bi + 1, 'words': words(p), 'decoyWords': words(new) if new else None,
                       'kept': ok, 'added': sorted(tokens(new) - tokens(p)) if new else None})
    json.dump(out, open(os.path.join(run, 'decoy', f'{rid}.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump({'id': rid, 'ratio': ratio, 'exhibits': report, 'cost': cost}, open(os.path.join(run, 'decoy', 'report.json'), 'w'), indent=1)
    print(json.dumps({'id': rid, 'exhibits': len(report), 'kept': sum(r['kept'] for r in report), 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
