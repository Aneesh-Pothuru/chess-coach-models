#!/usr/bin/env python3
"""A decoy of a run's video script for the judge's length control: restating beats
added to its board scenes until it is as long as asked, with nothing new in them
(no square, move, piece or number the scene does not already say, and no new
question, pause or advice), the rest of the script unchanged.

  decoy.py <case-dir> <run-dir> --words N [--model claude-sonnet-5-5]

N is how many spoken words to add over the whole script (the candidate's spoken
words over the baseline's on the case). Writes <run-dir>/decoy/<id>.video.json,
and <run-dir>/decoy/report.json with each scene's added words and whether its
beats passed the nothing-new check (a beat that fails is dropped). The model is asked for more than N; the beats that pass are
taken a scene at a time, the first of each scene, then the second, until N is reached.
"""
import copy, json, os, re, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, opt  # noqa: E402

SYSTEM = """You lengthen the narration of short chess coaching video scenes without adding anything. For each scene you get its beats (each a spoken line and its caption) and a target number of extra spoken words. Write restating beats that say again, in other words, what the scene already says, each to be inserted after a given beat of the scene. Add no new chess content: no square, move, piece, plan, threat, reason or number the scene does not already state. Add no question, no instruction to pause or think, and no new advice: only restatements of lines already there. Each beat is one or two short spoken sentences with a caption of a few words. Answer with the JSON object only."""

SCHEMA = {'type': 'object', 'properties': {'scenes': {'type': 'array', 'items': {'type': 'object', 'properties': {
    'scene': {'type': 'integer'},
    'beats': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'after': {'type': 'integer'}, 'say': {'type': 'string'}, 'caption': {'type': 'string'}},
        'required': ['after', 'say', 'caption']}}},
    'required': ['scene', 'beats']}}}, 'required': ['scenes']}

SQUARE = re.compile(r'\b[a-h][1-8]\b')
SPOKEN_SQUARE = re.compile(r'\b([a-h])\s+(one|two|three|four|five|six|seven|eight)\b', re.I)
SAN = re.compile(r'\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|O-O(?:-O)?)\b')
PIECE = re.compile(r'\b(king|queen|rook|bishop|knight|pawn)s?\b', re.I)
NUMBER = re.compile(r'\b\d+(?:\.\d+)?\b')
NUMBER_WORD = re.compile(r'\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|quarter)\b', re.I)


def words(s):
    return len(re.findall(r"[A-Za-z0-9'’]+", s or ''))


def tokens(s):
    s = s or ''
    return (set(SQUARE.findall(s)) | {f'{a.lower()} {b.lower()}' for a, b in SPOKEN_SQUARE.findall(s)} | set(SAN.findall(s))
            | {p.lower() for p in PIECE.findall(s)} | set(NUMBER.findall(s)) | {w.lower() for w in NUMBER_WORD.findall(s)})


def scene_text(s):
    return ' '.join(f'{b.get("say", "")} {b.get("caption", "")} {" ".join(b.get("moves") or [])}' for b in s.get('beats') or []) + f' {s.get("title", "")} {s.get("eyebrow", "")}'


def main():
    case, run = sys.argv[1], sys.argv[2]
    extra = int(float(opt('--words', '60')))
    model = opt('--model', 'claude-sonnet-5-5')
    rid = json.load(open(os.path.join(case, 'meta', 'case.json')))['id']
    src = os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{rid}.video.json')
    script = json.load(open(src))
    boards = [(i, s) for i, s in enumerate(script.get('scenes') or []) if s.get('board') and s.get('beats')]
    os.makedirs(os.path.join(run, 'decoy'), exist_ok=True)
    total = sum(words(scene_text(s)) for _, s in boards) or 1
    asks = []
    for i, s in boards:
        n = max(6, round(1.5 * extra * words(scene_text(s)) / total))
        beats = '\n'.join(f'  beat {k}: say "{b.get("say", "")}" | caption "{b.get("caption", "")}"' for k, b in enumerate(s['beats'], 1))
        asks.append(f'Scene {i + 1} ({len(s["beats"])} beats), target {n} extra spoken words:\n{beats}')
    prompt = 'Lengthen each scene by restating beats, as the instructions say.\n\n' + '\n\n'.join(asks)
    verdict, cost = ask(model, SYSTEM, SCHEMA, prompt, label=f'decoy {rid}', kind='decoy')
    got = {x['scene']: x['beats'] for x in verdict.get('scenes') or []}
    out = copy.deepcopy(script)
    report, passed = [], {}
    for i, s in boards:
        have = tokens(scene_text(s))
        for b in got.get(i + 1) or []:
            new = tokens(f'{b.get("say", "")} {b.get("caption", "")}')
            ok = new <= have and '?' not in (b.get('say', '') + b.get('caption', ''))
            row = {'scene': i + 1, 'after': b.get('after'), 'words': words(b.get('say')), 'clean': ok, 'kept': False, 'added': sorted(new - have)}
            report.append(row)
            if ok:
                passed.setdefault(i, []).append((b, row))
    total, rnd = 0, 0
    while total < extra and any(len(v) > rnd for v in passed.values()):
        for i in sorted(passed):
            if rnd < len(passed[i]) and total < extra:
                passed[i][rnd][1]['kept'] = True
                total += passed[i][rnd][1]['words']
        rnd += 1
    for i, s in boards:
        adds = [b for b, row in passed.get(i, []) if row['kept']]
        beats = list(out['scenes'][i]['beats'])
        for b in sorted(adds, key=lambda x: -int(x.get('after') or 0)):
            at = max(0, min(len(beats), int(b.get('after') or len(beats))))
            beats.insert(at, {'say': b['say'], 'caption': b['caption']})
        out['scenes'][i]['beats'] = beats
    json.dump(out, open(os.path.join(run, 'decoy', f'{rid}.video.json'), 'w'), ensure_ascii=False, indent=1)
    added = sum(r['words'] for r in report if r['kept'])
    json.dump({'id': rid, 'target': extra, 'added': added, 'beats': report, 'cost': cost}, open(os.path.join(run, 'decoy', 'report.json'), 'w'), indent=1)
    print(json.dumps({'id': rid, 'target': extra, 'added': added, 'kept': sum(r['kept'] for r in report), 'of': len(report), 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
