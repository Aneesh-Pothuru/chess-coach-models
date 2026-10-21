#!/usr/bin/env python3
"""Blind pairwise judge: one run's weekly or monthly video script against another's.

  judge.py <case-dir> <run-dir> --against <other-run-dir> [--model claude-sonnet-5-5]
  judge.py <case-dir> <run-dir> --control same            the run's script on both sides (every criterion should tie)
  judge.py <case-dir> <run-dir> --control decoy           the run's decoy (bin/decoy.py) as the candidate, the run's script as the reference

Both scripts are shown as A and B, twice, in both orders. A side wins a
criterion only when it wins in both orders; anything else is a tie. The
evidence is the graders' (bin/evidence.mts) with both scripts' board scenes.
Writes <run-dir>/judge-vs-<other config>.json, judge-control-same.json or
judge-control-decoy.json.
"""
import json, os, random, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, evidence, opt, rating_of, script_text  # noqa: E402

CRITERIA = ['truth', 'coaching', 'listening', 'overall']

SYSTEM = """You judge two versions of one {period}'s narrated chess coaching video, written for one player rated about {rating} in rapid from the same evidence. Each video is a script of scenes (a board from one of his games, a chart, tiles or bullets) and beats: each beat is a spoken line (say), its on-screen caption, the moves it plays on the board, what it draws, and a pause in seconds where he is meant to think. You see the evidence (the {period}'s brief, whose facts hold every number a video may say; the {period}'s turning points and games; the aggregate's and the career's digests; {audited}; and every board scene of both videos as the game archive, the engine and the knowledge service read it: the position, what was played there and next, the engine's best move and reply, the findability the day's Maia step archived there and the day's engine lines, how players at his level play there when the move is his (their most common moves, and his move's and the best move's share), the engine's plan lines and the human plan walk where the day computed them, the threats and readings, what each piece hits and guards, and what each move the scene plays does, with the engine's best reply after each move the game did not play) and the two videos, A and B. A {period}'s video synthesizes: what repeated across the {period}'s games and how often, shown through the clearest example, not each game re-taught. Judge as an experienced chess coach would, for this player. Length is not a virtue: a longer video costs his time, so prefer the one that teaches more per minute, and do not reward extra beats or extra questions that carry nothing.

Criteria, each answered "A", "B" or "tie":
- truth: every spoken line and caption matches the evidence: what a move did or threatened, what a piece attacks or guards, what was played and what is only the engine's line, who stood better, which day, game and move, how often something happened, and every number. A single false claim outweighs any amount of style; prefer the video with fewer and smaller misstatements.
- coaching: it teaches the way a strong human coach reviews a {period} with a player at his level: it names what repeated and shows it on the board, asks him to commit to his own move before showing the answer, names the habit behind a mistake and the habit that replaces it, follows a better move to its end by showing the opponent's best reply, says which misses are normal at his rating and which he could have found, and praises a good move by what it saw. Every lesson must be concrete on the board, true, and usable at the board next time; a coaching move that is vague, generic or false counts against the video.
- listening: it works heard once: one idea per line, plain words, the board signposted before it moves, a pause where he should think, no clutter of numbers or names.
- overall: which video you would rather he watched to improve, all of the above weighed, truth first.

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


def video_file(run, rid):
    return os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{rid}.video.json')


def main():
    case, run = sys.argv[1], sys.argv[2]
    model = opt('--model', 'claude-sonnet-5-5')
    control = opt('--control')
    against = opt('--against')
    rid = json.load(open(os.path.join(case, 'meta', 'case.json')))['id']
    mine = video_file(run, rid)
    if control == 'same':
        files, name = {'candidate': mine, 'reference': mine}, 'judge-control-same.json'
    elif control == 'decoy':
        files, name = {'candidate': os.path.join(run, 'decoy', f'{rid}.video.json'), 'reference': mine}, 'judge-control-decoy.json'
    else:
        files = {'candidate': mine, 'reference': video_file(against, rid)}
        name = f'judge-vs-{os.path.normpath(against).split(os.sep)[-3]}.json'
    out = os.path.join(run, name)
    missing = [k for k, f in files.items() if not os.path.exists(f)]
    if missing:
        json.dump({'id': rid, 'missing': missing[0]}, open(out, 'w'))
        print('missing video script')
        return
    kind = json.load(open(os.path.join(case, 'meta', 'case.json')))['kind']
    period = 'week' if kind == 'weekly' else 'month'
    audited = "the week's daily logs, which the weekly audits" if kind == 'weekly' else "the month's weekly reviews, which the monthly audits"
    system = SYSTEM.format(period=period, rating=rating_of(case, rid), audited=audited)
    rounds, cost = [], 0.0
    for first in random.sample(['reference', 'candidate'], 2):
        second = 'candidate' if first == 'reference' else 'reference'
        ev = evidence(case, rid, {'A': files[first], 'B': files[second]})
        prompt = (f'The {kind} review {rid}.\n\nThe evidence:\n{ev}\n\n'
                  f'Video A:\n{script_text(json.load(open(files[first])))}\n\n'
                  f'Video B:\n{script_text(json.load(open(files[second])))}\n')
        verdict, c = ask(model, system, SCHEMA, prompt, label=f'judge {rid} {name}', kind='judge')
        cost += c
        named = {k: ({'A': first, 'B': second}.get(verdict[k], 'tie')) for k in CRITERIA}
        named['falseClaims'] = {first: verdict.get('falseClaimsA', []), second: verdict.get('falseClaimsB', [])}
        named['why'] = verdict.get('why', '')
        named['order'] = [first, second]
        rounds.append(named)
    final = {k: (rounds[0][k] if rounds[0][k] == rounds[1][k] else 'tie') for k in CRITERIA}
    result = {'id': rid, 'model': model, 'against': against, 'control': control, 'final': final, 'rounds': rounds, 'cost': cost}
    json.dump(result, open(out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({'id': rid, 'control': control, **final, 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
