#!/usr/bin/env python3
"""results/scenes.json: for each config and day, the audit's moment scenes as
booleans only (whether the scene plays or names a better move, and whether it
says what the position is about first, what the better move does and an idea to
reuse), so the paper can show where the asked moves go missing. No quote, game,
opponent or position leaves the eval directory.

  scenes.py [config ...]   (default: baseline lesson-moves lesson-moves-2)
"""
import json, os, sys

BIN = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BIN)
from common import PROJECT, load  # noqa: E402
from batch import IDS, run_dir  # noqa: E402


def moments(config, i):
    a = load(os.path.join(run_dir(config, i), 'audit.json'))
    if not a or 'verdict' not in a:
        return None
    return [{'better': s.get('betterSound') is not None, 'aboutFirst': bool(s.get('aboutFirst')),
             'purposeNamed': bool(s.get('purposeNamed')), 'takeaway': bool(s.get('takeaway'))}
            for s in a['verdict'].get('scenes', []) if s.get('kind') == 'moment']


def main():
    configs = sys.argv[1:] or ['baseline', 'lesson-moves', 'lesson-moves-2']
    out = {c: {i: m for i in IDS for m in [moments(c, i)] if m is not None} for c in configs}
    path = os.path.join(PROJECT, 'results', 'scenes.json')
    json.dump(out, open(path, 'w'), indent=1)
    print(json.dumps({c: sum(len(v) for v in d.values()) for c, d in out.items()}))


if __name__ == '__main__':
    main()
