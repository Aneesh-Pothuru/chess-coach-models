#!/usr/bin/env python3
"""Pointwise audit of one daily video script against the evidence it was written from,
on what the player asked for: what the position is about, what the better move does,
an idea to reuse, a sound move, and no engine verdict.

  audit.py <case-dir> <run-dir> [--model claude-sonnet-5-5]
  audit.py <case-dir> --published [--model claude-sonnet-5-5]     the script that landed, against the case's brief
  audit.py <case-dir> <run-dir> --decoy                           the run's decoy (bin/decoy.py)

The auditor reads the evidence (bin/evidence.mts: the brief without its bulk, the
day's games and turning points, analyze.cjs's digest, and every board scene as
the archive and the knowledge service read it) and the script, and returns:

1. claims: every spoken line or caption that the evidence contradicts or does not
   carry (false, unsupported, misleading);
2. scenes: for each board scene, what kind of scene it is, its claims about the
   board that the evidence contradicts, and for a moment or praise scene which of
   the coaching moves it makes (the yardstick the judge's coaching criterion names).

Writes <run-dir>/audit.json (audit-decoy.json for a decoy), or
<case-dir>/meta/audit-published.json.
"""
import json, os, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import ask, evidence, opt, rating_of, script_text, spoken_seconds  # noqa: E402

SYSTEM = """You audit one day's narrated chess coaching video, written for one player rated about {rating} in rapid, against the evidence it was written from: the day's brief (every number the video may say is one of its facts), the day's games and turning points with his think times, the video grammar's fixed milestone card (a rule any day may restate), the engine digest of the day (the engine's lines, what was played next, the lesson lines), how often players at his level play the engine's best move and his move at each turning point (the findability list), for every board scene the position as the game archive replays it, what was played there and next, the engine's best move and reply, when the move there is his how players at his level play it (the scene's Maia-2 line: their most common moves, and his move's and the engine's best move's share and rank), the engine's plan lines and the human plan walk where the routine computed them, the threats and readings, what each piece hits and guards, and what each move the scene plays does, with the engine's best reply after each move the game did not play, and the study lessons he follows, with the sections of any lesson the review names. A position's FEN is exact: read the pieces and their lines from it. The video is a script of scenes and beats; each beat is a spoken line (say), its caption, the moves it plays, what it draws and a pause. Be exact and skeptical; do not reward style or length.

1. claims: every spoken line or caption, anywhere in the video, that the evidence contradicts or does not carry. Check what a move did or threatened, what a piece attacks or guards, where a piece stands, what was played and what is only the engine's line, which game and move, how many times something happened, what he did in practice, what a lesson teaches, and every number. Quote the video's words exactly (a short span), say what the evidence shows, and grade each: "false" (the evidence contradicts it), "unsupported" (the evidence does not carry it), or "misleading" (true in letter, wrong in what he will take from it). A line the evidence carries is not listed at all, and neither is a matter of taste; if you list a line you checked and found it holds, grade it "holds", never "misleading" or "unsupported", and it counts for nothing. A move a beat plays that the game did not play is a line that could have happened; saying the game went that way is false. A claim about how players at his level do is carried only by the findability list, a scene's Maia-2 line or human plan, the digest's punish lines or the brief.

2. scenes: one entry per board scene, in order, with its scene number. kind is "moment" (it teaches a mistake he made or a chance he missed: the scene shows or names a better move than his), "praise" (it shows a move he got right), "judgement" (a quiet position: what it is about, or who is better), "plan" (the opponent's plan or a plan walk), or "other" (a cold open, a recap or tomorrow's habit that teaches no new move). Then:
- openQuestion: before any answer is given, does the scene's first question ask what he would play there, open (not narrowed to a kind of move such as "which check" or "which capture")? true or false; null when the scene asks him nothing.
- verdict: does any line of the scene say who stands better, by how much, or what the engine thinks of the position as a whole ("you are winning", "it is level", "about equal", "the engine agrees", "White is better")? true or false. Saying what a move wins or loses (a piece, a pawn, the exchange) is not a verdict.
- aboutFirst: before the better move is given, does the scene say what the position is about on the board: the threat, the loose piece, the weak square, the open file, the plan? true or false; null unless kind is moment.
- purposeNamed: does the scene say what the better move does on the board, concretely: the threat it meets, what it wins, what it trades, the file or square it takes, the piece it improves? true or false; null unless kind is moment.
- takeaway: does the scene give an idea he can reuse in other games, tied to this position (a pattern, a technique, a plan, the rule of a lesson), beyond this one move? true or false; null unless kind is moment.
- lessonNamed: does the scene name one of his study lessons? true or false; null unless kind is moment.
- lessonFits: when lessonNamed is true, does that lesson, as the evidence shows its sections, teach what the scene teaches? true or false; null when lessonNamed is not true.
- betterSound: is the better move the scene teaches sound by the evidence: the engine's best move there, or a move the evidence shows keeps his position (one of the engine's lines close to the best, or a line that wins the same material or keeps the same result)? true or false; null when the evidence cannot tell, or kind is not moment.
- engineRecital: does the scene recite or play an engine line of three or more moves without saying what those moves do? true or false; null unless kind is moment.
- thenWhat: after the better move is shown or named, does the scene show or say the opponent's best reply to it and why the move still holds? true or false; null when the scene shows no better move.
- habitNamed: does the scene name the habit or kind of move behind his mistake, concretely and as the evidence shows it? true or false; null unless kind is moment.
- replacement: does the scene end on an in-game habit that replaces it, one he can apply at the board? true or false; null unless kind is moment.
- praiseNamed: does the scene name what his good move saw (the threat it met, the square or piece it used)? true or false; null unless kind is praise.
- boardClaims: only the scene's claims about the board (what attacks, guards or blocks what, where a piece stands, what a move threatens or allows, what was played) that the evidence contradicts, each quoted exactly with what the evidence shows. A claim that holds is never listed; an empty list when every board claim holds.

Answer with the JSON object only."""

TRI = {'type': ['boolean', 'null']}
ITEMS = ['openQuestion', 'verdict', 'aboutFirst', 'purposeNamed', 'takeaway', 'lessonNamed', 'lessonFits', 'betterSound', 'engineRecital', 'thenWhat', 'habitNamed', 'replacement', 'praiseNamed']
SCHEMA = {
    'type': 'object',
    'properties': {
        'claims': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'quote': {'type': 'string'}, 'evidence': {'type': 'string'},
            'grade': {'type': 'string', 'enum': ['false', 'unsupported', 'misleading', 'holds']}},
            'required': ['quote', 'evidence', 'grade']}},
        'scenes': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'scene': {'type': 'integer'},
            'kind': {'type': 'string', 'enum': ['moment', 'praise', 'judgement', 'plan', 'other']},
            **{k: TRI for k in ITEMS},
            'boardClaims': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'quote': {'type': 'string'}, 'evidence': {'type': 'string'}}, 'required': ['quote', 'evidence']}}},
            'required': ['scene', 'kind', *ITEMS, 'boardClaims']}},
        'notes': {'type': 'string'},
    },
    'required': ['claims', 'scenes', 'notes'],
}

MOVES = ['aboutFirst', 'purposeNamed', 'takeaway']
MOMENT_ITEMS = ['aboutFirst', 'purposeNamed', 'takeaway', 'lessonNamed', 'betterSound', 'engineRecital', 'thenWhat', 'habitNamed', 'replacement']


def tally(verdict):
    sc = verdict.get('scenes') or []
    moments = [s for s in sc if s.get('kind') == 'moment']
    praise = [s for s in sc if s.get('kind') == 'praise']

    def rate(rows, key, want=True):
        owed = [r for r in rows if r.get(key) is not None]
        return (sum(1 for r in owed if r.get(key) is want), len(owed))

    t = {'scenes': len(sc), 'moments': len(moments), 'praise': len(praise),
         'boardClaimsFalse': sum(len(s.get('boardClaims') or []) for s in sc),
         'verdictScenes': sum(1 for s in sc if s.get('verdict') is True)}
    for k in MOMENT_ITEMS:
        t[k] = rate(moments, k)
    t['unsound'] = rate(moments, 'betterSound', False)
    t['lessonFits'] = rate(moments, 'lessonFits')
    t['openQuestionAll'] = rate(sc, 'openQuestion')
    t['praiseNamed'] = rate(praise, 'praiseNamed')
    # The share of the asked writing moves (what the position is about, what the better move does, an idea to reuse) the moment scenes make.
    made = sum(t[k][0] for k in MOVES)
    owed = sum(t[k][1] for k in MOVES)
    t['askedShare'] = round(made / owed, 3) if owed else None
    return t


def main():
    case = sys.argv[1]
    published = '--published' in sys.argv
    decoy = '--decoy' in sys.argv
    run = None if published else sys.argv[2]
    model = opt('--model', 'claude-sonnet-5-5')
    rid = json.load(open(os.path.join(case, 'meta', 'case.json')))['id']
    if published:
        video = os.path.join(case, 'meta', 'published-video.json')
        out = os.path.join(case, 'meta', 'audit-published.json')
    elif decoy:
        video = os.path.join(run, 'decoy', f'{rid}.video.json')
        out = os.path.join(run, 'audit-decoy.json')
    else:
        video = os.path.join(run, 'out', 'coach-log', 'review-annotations', f'{rid}.video.json')
        out = os.path.join(run, 'audit.json')
    if not os.path.exists(video):
        json.dump({'id': rid, 'missing': True}, open(out, 'w'))
        print('missing video script')
        return
    script = json.load(open(video))
    ev = evidence(case, rid, {'V': video})
    prompt = f'The daily review {rid}.\n\nThe evidence:\n{ev}\n\nThe video:\n{script_text(script)}\n'
    verdict, cost = ask(model, SYSTEM.format(rating=rating_of(case, rid)), SCHEMA, prompt, label=f'audit {rid} {os.path.basename(out)}')
    counts = {g: sum(1 for c in verdict['claims'] if c.get('grade') == g) for g in ('false', 'unsupported', 'misleading')}
    result = {'id': rid, 'model': model, 'published': published, 'decoy': decoy, 'counts': counts, 'tally': tally(verdict),
              'seconds': spoken_seconds(script), 'verdict': verdict, 'cost': cost}
    json.dump(result, open(out, 'w'), indent=1, ensure_ascii=False)
    t = result['tally']
    print(json.dumps({'id': rid, 'published': published, **counts, 'boardFalse': t['boardClaimsFalse'], 'moments': t['moments'],
                      'askedShare': t['askedShare'], 'verdictScenes': t['verdictScenes'], 'unsound': t['unsound'], 'seconds': result['seconds'], 'cost': round(cost, 3)}))


if __name__ == '__main__':
    main()
