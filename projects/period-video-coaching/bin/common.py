"""What the graders and the batch share: where the eval lives, the model call with
its spend ledger, the evidence, the video script as a grader reads it and the
paired bootstrap."""
import json, os, random, subprocess, sys, time

BIN = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BIN)
EVAL = os.environ.get('EVAL_ROOT', '/tmp/period-video')
LEDGER = os.path.join(EVAL, 'ledger.jsonl')
OFFLINE = f'--require {os.path.join(BIN, "offline.cjs")}'


def opt(name, default=None, argv=None):
    argv = sys.argv if argv is None else argv
    return argv[argv.index(name) + 1] if name in argv else default


def load(p):
    try:
        return json.load(open(p))
    except (OSError, ValueError):
        return None


def record(kind, label, cost, windows=None, model=None):
    """One line per model call: the list-price cost and the usage windows after it."""
    os.makedirs(EVAL, exist_ok=True)
    with open(LEDGER, 'a') as f:
        f.write(json.dumps({'t': round(time.time()), 'kind': kind, 'label': label, 'model': model, 'cost': cost or 0.0, 'windows': windows}) + '\n')


def ledger():
    rows = []
    if os.path.exists(LEDGER):
        for line in open(LEDGER):
            try:
                rows.append(json.loads(line))
            except ValueError:
                pass
    return rows


def spent():
    """The ledger's spend; a hold row only pauses a batch started before it."""
    return round(sum(r.get('cost') or 0.0 for r in ledger() if r.get('kind') != 'hold'), 2)


def latest_windows():
    for r in reversed(ledger()):
        if r.get('windows'):
            return r['windows']
    return None


def windows_of(info):
    w = (info or {}).get('unifiedWindows') or {}
    return {k: (w.get(k) or {}).get('utilization') for k in ('five_hour', 'seven_day')}


def ask(model, system, schema, prompt, label='grader', kind='grader', timeout=1200):
    """One structured answer from a model with no tools, through a clean headless session."""
    cmd = [os.path.join(BIN, 'claude-clean.sh'), '/tmp', '--model', model, '--output-format', 'stream-json', '--verbose',
           '--tools', '', '--max-turns', '3', '--system-prompt', system, '--json-schema', json.dumps(schema), '--no-session-persistence']
    last_err = None
    for attempt in range(3):
        p = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout)
        result, windows = None, None
        for line in p.stdout.splitlines():
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get('type') == 'rate_limit_event':
                windows = windows_of(ev.get('rate_limit_info'))
            elif ev.get('type') == 'result':
                result = ev
        cost = (result or {}).get('total_cost_usd') or 0.0
        record(kind, label, cost, windows, model)
        verdict = (result or {}).get('structured_output')
        if verdict is None and result and result.get('result'):
            txt = result['result']
            try:
                verdict = json.loads(txt[txt.find('{'):txt.rfind('}') + 1])
            except ValueError:
                verdict = None
        if verdict is not None:
            return verdict, cost
        last_err = (p.stderr or '')[-400:] or (result or {}).get('subtype')
        time.sleep(20 * (attempt + 1))
    raise RuntimeError(f'no structured answer from {model}: {last_err}')


def evidence(case, rid, named, scenes_only=False):
    """bin/evidence.mts run in the case's checkout: named maps a video's label to its script file."""
    repo = os.path.abspath(os.path.join(case, 'repo'))
    args = [os.path.join(repo, 'node_modules', '.bin', 'tsx'), os.path.join(BIN, 'evidence.mts'), rid]
    if scenes_only:
        args.append('--scenes-only')
    args += [f'{k}={os.path.abspath(v)}' for k, v in named.items()]
    env = dict(os.environ, NODE_OPTIONS=(os.environ.get('NODE_OPTIONS', '') + ' ' + OFFLINE).strip(),
               EVIDENCE_MAIA_DIR=os.path.join(EVAL, 'maia'))
    p = subprocess.run(args, cwd=repo, capture_output=True, text=True, env=env, timeout=900)
    if p.returncode != 0:
        raise RuntimeError(f'evidence.mts failed: {p.stderr[-600:]}')
    return p.stdout


def _q(s):
    return json.dumps(s, ensure_ascii=False)


def script_text(script):
    """A video script as a grader reads it: each scene with what it shows, and each beat's
    spoken line, caption, the moves it plays, its pause and what it draws."""
    out = []
    for i, s in enumerate(script.get('scenes') or [], 1):
        head = f'SCENE {i}: eyebrow {_q(s.get("eyebrow", ""))}, title {_q(s.get("title", ""))}'
        if s.get('board'):
            b = s['board']
            where = f'game {_q(b.get("game"))}, ply {b.get("ply")}' if b.get('game') is not None else f'free position {b.get("fen")}'
            head += f'; a board ({where}{", flipped" if b.get("flip") else ""}{", readings on" if b.get("insights") else ""})'
        elif s.get('chart'):
            c = s['chart']
            kind = c.get('kind') if isinstance(c, dict) else c
            data = f' of {c.get("data")}' if isinstance(c, dict) and c.get('data') else ''
            head += f'; a chart ({kind}{data})'
        elif s.get('stats'):
            head += '; tiles: ' + '; '.join(f'{t.get("n")} ({t.get("l")})' for t in s['stats'])
        elif s.get('bullets'):
            head += '; bullets: ' + '; '.join(str(x) for x in s['bullets'])
        elif s.get('skillmap'):
            head += '; the skill map'
        out.append(head)
        for k, bt in enumerate(s.get('beats') or [], 1):
            parts = [f'say {_q(bt.get("say", ""))}']
            if bt.get('caption'):
                parts.append(f'caption {_q(bt["caption"])}')
            if bt.get('moves'):
                parts.append('plays ' + ' '.join(bt['moves']))
            ins = bt.get('insights')
            if isinstance(ins, dict):
                for key in ('move', 'reply'):
                    if ins.get(key):
                        who = 'the move he could play' if key == 'move' else 'the reply they could play'
                        parts.append(f'reads {who} {ins[key]}' + (f' as {_q(ins["label"])}' if ins.get('label') else ''))
            if bt.get('arrows'):
                parts.append('arrows ' + ', '.join(f'{a.get("from")}-{a.get("to")} ({a.get("kind", "")})' for a in bt['arrows']))
            elif bt.get('arrows') == []:
                parts.append('arrows cleared')
            if bt.get('marks'):
                parts.append('marks ' + ', '.join(f'{m.get("sq")} ({m.get("kind", "")})' for m in bt['marks']))
            panel = bt.get('panel')
            if isinstance(panel, dict) and panel.get('rows'):
                parts.append('panel ' + ', '.join(f'{r.get("label")}: {r.get("value")}' for r in panel['rows']))
            if 'hold' in bt:
                parts.append(f'pause {bt["hold"]}s')
            for key in ('reveal', 'until', 'focus', 'labels'):
                if key in bt:
                    parts.append(f'{key} {bt[key]}')
            out.append(f'  beat {k}: ' + ' | '.join(parts))
    return '\n'.join(out)


def spoken_seconds(script, wps=2.6):
    """The video's length heard once: its spoken words at a narrator's pace and every pause
    (0.6s where a beat gives none)."""
    import re
    words, pause = 0, 0.0
    for s in script.get('scenes') or []:
        for bt in s.get('beats') or []:
            words += len(re.findall(r"[A-Za-z0-9'’]+", bt.get('say') or ''))
            pause += float(bt.get('hold', 0.6) or 0)
    return round(words / wps + pause, 1)


def rating_of(case, rid):
    brief = load(os.path.join(case, 'repo', 'coach-log', 'briefs', f'{rid}.json')) or {}
    rec = brief.get('record') or {}
    r = rec.get('ratingTo') or rec.get('ratingFrom')
    return int(round(r / 50.0) * 50) if isinstance(r, (int, float)) else 1150


def boot(xs, stat=None, n=4000, seed=7):
    """A percentile bootstrap interval of the mean, resampling cases (the unit the runs are paired in)."""
    stat = stat or (lambda v: sum(v) / len(v))
    keys = sorted(k for k, v in xs.items() if v)
    if not keys:
        return None
    rnd = random.Random(seed)
    vals = []
    for _ in range(n):
        sample = [v for k in (rnd.choice(keys) for _ in keys) for v in xs[k]]
        vals.append(stat(sample))
    vals.sort()
    flat = [v for k in keys for v in xs[k]]
    return {'est': round(stat(flat), 3), 'lo': round(vals[int(0.025 * n)], 3), 'hi': round(vals[int(0.975 * n) - 1], 3), 'n': len(flat), 'cases': len(keys)}
