#!/usr/bin/env python3
"""The mechanical grades of one writer run (no model involved).

  grade.py <case-dir> <run-dir>      writes <run-dir>/grade.json and prints a one-line summary

From the session's stream: every period check it ran, with the errors and
warnings each reported (the first one is the first draft's), the commands it
should not have run, the tools it used, the session's usage and how far the
subscription's usage windows moved while it ran. From what it left: the final
check (run by the harness), the files written and the word counts.
"""
import json, os, re, sys

CLI = r'coach(?:\.ts)?\s+(?:--\s+)?'
FORBIDDEN = {
    'prepare': re.compile(CLI + r'(?:weekly|monthly|daily)\s+prepare\b'),
    'npm ci': re.compile(r'\bnpm\s+(?:ci|install)\b'),
    'chess.com': re.compile(r'(?:curl|wget)\b.*chess\.com|node\s+\S*(?:analyze|aggregate)\.cjs'),
    'push': re.compile(r'\bgit\s+push\b'),
    'commit': re.compile(r'\bgit\s+commit\b'),
    'publish': re.compile(CLI + r'(?:daily|weekly|monthly)\s+publish\b'),
    'render': re.compile(r'node\s+\S*video\.cjs'),
}
PERIOD_CHECK = re.compile(CLI + r'(?:weekly|monthly)\s+check\b')
REVIEW_CHECK = re.compile(CLI + r'check\s+review\b')
HEREDOC = re.compile(r"(<<-?\s*(['\"]?)(\w+)\2[^\n]*\n)(.*?\n)?[ \t]*\3[ \t]*(?=\n|$)", re.S)


def runs(cmd):
    """The command with its heredoc bodies removed: a heredoc's body is text it writes, not commands it runs."""
    return HEREDOC.sub(lambda m: m.group(1), cmd)


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))
    return ''


def words(s):
    return len(re.findall(r"[A-Za-z0-9'’]+", re.sub(r'<[^>]+>', ' ', s or '')))


def walk_strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from walk_strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from walk_strings(v)


def window(info, name):
    w = ((info or {}).get('unifiedWindows') or {}).get(name) or {}
    return w.get('utilization')


def main():
    case, run = sys.argv[1], sys.argv[2]
    meta = json.load(open(os.path.join(case, 'meta', 'case.json')))
    rid, kind = meta['id'], meta['kind']
    runmeta = json.load(open(os.path.join(run, 'run.json')))
    calls, results, final, tools, sub_tools, ordered, limits = {}, {}, None, {}, {}, [], []
    for line in open(os.path.join(run, 'stream.jsonl')):
        line = line.strip()
        if not line.startswith('{'):
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        t = ev.get('type')
        if t == 'assistant':
            for c in ev.get('message', {}).get('content', []):
                if c.get('type') == 'tool_use':
                    calls[c['id']] = {'name': c['name'], 'input': c.get('input', {}), 'sub': bool(ev.get('parent_tool_use_id'))}
                    bucket = sub_tools if ev.get('parent_tool_use_id') else tools
                    bucket[c['name']] = bucket.get(c['name'], 0) + 1
        elif t == 'user':
            content = ev.get('message', {}).get('content', [])
            if isinstance(content, list):
                for c in content:
                    if isinstance(c, dict) and c.get('type') == 'tool_result':
                        results[c['tool_use_id']] = {'text': text_of(c.get('content')), 'error': bool(c.get('is_error'))}
                        ordered.append(c['tool_use_id'])
        elif t == 'rate_limit_event':
            limits.append(ev.get('rate_limit_info') or {})
        elif t == 'result':
            final = ev
    checks, checks_run, forbidden = [], [], {}
    for cid, call in calls.items():
        if call['name'] != 'Bash':
            continue
        cmd = runs(call['input'].get('command', ''))
        res = results.get(cid, {'text': '', 'error': False})
        for k, rx in FORBIDDEN.items():
            if rx.search(cmd):
                forbidden.setdefault(k, []).append(cmd[:200])
        if PERIOD_CHECK.search(cmd) or REVIEW_CHECK.search(cmd):
            checks_run.append({'cmd': f'{kind} check' if PERIOD_CHECK.search(cmd) else 'check review', 'sub': call['sub'],
                               'background': 'running in background' in res['text']})
    summary = re.compile(rf'{re.escape(rid)}: (\d+) errors?, (\d+) warnings?|strict bar: (\d+) errors?, (\d+) warnings?')
    last = None
    for cid in ordered:
        text = results[cid]['text']
        m = summary.search(text)
        if not m or text == last:
            continue
        last = text
        e, w = (m.group(1), m.group(2)) if m.group(1) is not None else (m.group(3), m.group(4))
        checks.append({'errors': int(e), 'warnings': int(w), 'sub': calls.get(cid, {}).get('sub', False)})
    for cid, call in calls.items():
        target = call['input'].get('file_path', '') if call['name'] in ('Write', 'Edit') else ''
        cmd = call['input'].get('command', '') if call['name'] == 'Bash' else ''
        if f'coach-log/briefs/{rid}' in target or re.search(rf'>\s*\S*coach-log/briefs/{rid}', cmd):
            forbidden.setdefault('edit brief', []).append((target or cmd)[:200])
    try:
        fcj = json.load(open(os.path.join(run, 'final-check.json')))
        fc = {'ok': runmeta.get('finalCheckExit') == 0, 'errors': len(fcj.get('errors') or []), 'warnings': len(fcj.get('warnings') or []),
              'refused': bool(fcj.get('refused')), 'errorList': (fcj.get('errors') or [])[:40], 'warningList': (fcj.get('warnings') or [])[:40]}
    except (OSError, ValueError):
        fc = {'ok': False, 'errors': None, 'warnings': None}
    out = os.path.join(run, 'out')
    files = {
        'annotations': f'coach-log/review-annotations/{rid}.json',
        'video': f'coach-log/review-annotations/{rid}.video.json',
        'log': f'coach-log/{rid}.md',
        'rules': 'coach-log/rules.json',
        'studies': 'public/coach/studies/index.json',
        'notesReply': 'public/coach/notes-reply.json',
        'briefing': 'public/coach/briefing.json',
    }
    wrote = {k: os.path.exists(os.path.join(out, v)) for k, v in files.items()}
    other = []
    if os.path.exists(os.path.join(run, 'changed-files.txt')):
        for line in open(os.path.join(run, 'changed-files.txt')):
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= 2 and not parts[-1].startswith(('coach-log/', 'public/coach/')):
                other.append(parts[-1])
    ann_words, video_words, boards, sections = None, None, None, None
    if wrote['annotations']:
        ann = json.load(open(os.path.join(out, files['annotations'])))
        ann_words = sum(words(s) for s in walk_strings(ann))
        sections = len(ann.get('sections') or [])
        boards = sum(len(s.get('boards') or []) for s in ann.get('sections') or [])
    if wrote['video']:
        video_words = sum(words(s) for s in walk_strings(json.load(open(os.path.join(out, files['video'])))))
    usage = None
    if final:
        u = final.get('usage') or {}
        usage = {
            'cost': final.get('total_cost_usd'),
            'turns': final.get('num_turns'),
            'durationMs': final.get('duration_ms'),
            'input': u.get('input_tokens'),
            'cacheRead': u.get('cache_read_input_tokens'),
            'cacheWrite': u.get('cache_creation_input_tokens'),
            'output': u.get('output_tokens'),
            'models': {m: round(v.get('costUSD', 0), 4) for m, v in (final.get('modelUsage') or {}).items()},
            'subtype': final.get('subtype'),
            'isError': final.get('is_error'),
        }
    windows = None
    if limits:
        windows = {name: {'first': window(limits[0], name), 'last': window(limits[-1], name)} for name in ('five_hour', 'seven_day')}
        windows['statuses'] = sorted({str(x.get('status')) for x in limits})
    first = next((c for c in checks if c['errors'] is not None), None)
    grade = {
        'id': rid,
        'kind': kind,
        'model': runmeta.get('model'),
        'exit': runmeta.get('exit'),
        'seconds': runmeta.get('seconds'),
        'final': fc,
        'checks': checks,
        'checksRun': checks_run,
        'rounds': len(checks),
        'firstDraft': {'errors': first['errors'], 'warnings': first['warnings']} if first else None,
        'forbidden': forbidden,
        'tools': tools,
        'subagentTools': sub_tools,
        'wrote': wrote,
        'otherFiles': other,
        'words': {'annotations': ann_words, 'video': video_words},
        'sections': sections,
        'boards': boards,
        'usage': usage,
        'windows': windows,
    }
    json.dump(grade, open(os.path.join(run, 'grade.json'), 'w'), indent=1)
    print(json.dumps({
        'id': rid, 'pass': fc.get('ok'), 'rounds': grade['rounds'], 'first': grade['firstDraft'],
        'final': [fc.get('errors'), fc.get('warnings')], 'boards': boards,
        'cost': usage and usage['cost'], 'turns': usage and usage['turns'], 'min': round((runmeta.get('seconds') or 0) / 60, 1),
        'forbidden': sorted(forbidden), 'windows': windows,
    }))


if __name__ == '__main__':
    main()
