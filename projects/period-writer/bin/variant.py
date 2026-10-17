#!/usr/bin/env python3
"""Write a candidate's prompts: the app's routine prompt with the candidate's insertion.

  variant.py <variants/NAME.json> <out-dir> [app-commit]

The app's prompts are private, so only the insertion is kept in this repository;
the full prompts are written at run time to <out-dir>/<kind>.md (under the eval
directory, never committed). Each anchor must occur exactly once.
"""
import json, os, subprocess, sys

spec = json.load(open(sys.argv[1]))
out = sys.argv[2]
commit = sys.argv[3] if len(sys.argv) > 3 else 'fa07ea1ed8f4a17ec0c3df26cf15d54fea36d3b0'
repo = os.environ.get('CHESS_DIR', '/home/user/chess')
os.makedirs(out, exist_ok=True)
for kind, ins in spec['insert'].items():
    doc = subprocess.run(['git', '-C', repo, 'show', f'{commit}:docs/routines/{kind}.md'], capture_output=True, text=True, check=True).stdout
    n = doc.count(ins['after'])
    if n != 1:
        sys.exit(f'{kind}: the anchor occurs {n} times')
    i = doc.index(ins['after']) + len(ins['after'])
    open(os.path.join(out, f'{kind}.md'), 'w').write(doc[:i] + ins['text'] + doc[i:])
    print(f'{kind}: {len(doc)} -> {len(doc) + len(ins["text"])} bytes')
