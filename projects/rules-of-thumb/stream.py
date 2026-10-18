#!/usr/bin/env python3
"""Stream the fixed game's filter; checkpoints contain only kept compact games."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import urllib.request
import chess.pgn
import zstandard

LAB = Path(__file__).resolve().parents[2]
URL = 'https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst'
MONTHS = ('2026-07', '2026-08', '2026-09')


def atomic_json(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def pgn_records(lines):
    headers, moves = {}, []
    for line in lines:
        if line.startswith('[Event ') and headers:
            yield headers, ' '.join(moves)
            headers, moves = {}, []
        if line.startswith('['):
            match = re.fullmatch(r'\[(\w+) "(.*)"\]\s*', line)
            if match:
                headers[match[1]] = match[2]
        elif line.strip():
            moves.append(line.strip())
    if headers:
        yield headers, ' '.join(moves)


def keep(h, movetext):
    if not h.get('Event', '').startswith('Rated ') or h.get('Variant', 'Standard') != 'Standard':
        return None
    if h.get('TimeControl') != '600+0' or h.get('Termination') not in ('Normal', 'Time forfeit'):
        return None
    try:
        white, black = int(h['WhiteElo']), int(h['BlackElo'])
    except (KeyError, ValueError):
        return None
    if not (1250 <= white <= 1649 and 1250 <= black <= 1649):
        return None
    # Only candidate games are parsed. No eval or clock filter is imposed.
    fen_header = f'[FEN "{h["FEN"]}"]\n[SetUp "1"]\n\n' if 'FEN' in h else ''
    game = chess.pgn.read_game(io.StringIO(fen_header + movetext))
    if game is None or game.errors:
        raise ValueError('eligible game did not parse; refusing a changed sample')
    plies = sum(1 for _ in game.mainline_moves())
    if plies < 30:
        return None
    game_id = h.get('Site', '').rsplit('/', 1)[-1]
    if not game_id:
        raise ValueError('eligible game lacks the seed id')
    out = dict(id=game_id, whiteElo=white, blackElo=black, tc='600+0',
               result=h.get('Result'), termination=h['Termination'], plies=plies,
               movetext=game.accept(chess.pgn.StringExporter(headers=False, comments=False, variations=False)))
    if 'FEN' in h:
        out['initialFen'] = h['FEN']
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--month', required=True, choices=MONTHS)
    ap.add_argument('--run', choices=('slice', 'full'), default='slice')
    ap.add_argument('--games', type=int, default=None)
    ap.add_argument('--phase2-reviewed', action='store_true')
    args = ap.parse_args()
    if args.run == 'full' and not args.phase2_reviewed:
        ap.error('full scan waits for reviewer answers; use --phase2-reviewed only after review')
    if args.run == 'slice' and args.month != '2026-07':
        ap.error('phase 1 is July only')
    cap = args.games if args.games is not None else (300 if args.run == 'slice' else 30000)
    if args.run == 'full' and cap != 30000:
        ap.error('full run uses the fixed 30000-game cap; EOF may end it sooner')
    if not 1 <= cap <= (500 if args.run == 'slice' else 30000):
        ap.error('slice cap is 500; full cap is 30000')
    directory = LAB / 'private/rules-of-thumb' / args.run
    directory.mkdir(parents=True, exist_ok=True)
    chunks = directory / f'stream-{args.month}'
    chunks.mkdir(exist_ok=True)
    state_path = chunks / 'state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else dict(gamesRead=0, kept=0, parts=0, seconds=0., eof=False)
    if args.run == 'full':
        version = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        signature = dict(streamVersion=version, source=URL.format(month=args.month), cap=cap)
        if state_path.exists() and any(state.get(k) != v for k, v in signature.items()):
            raise ValueError('stream checkpoint code, source or cap changed; review before restarting')
        state.update(signature)
    if state['kept'] > cap:
        raise ValueError('existing sample exceeds requested cap')
    started, pending = time.perf_counter(), []
    resume_read = state['gamesRead']
    def checkpoint(read, eof=False):
        nonlocal pending, started
        if pending:
            path = chunks / f'{state["parts"]:06d}.jsonl.gz'
            tmp = path.with_suffix('.tmp')
            with gzip.open(tmp, 'wt') as out:
                for row in pending:
                    out.write(json.dumps(row, separators=(',', ':')) + '\n')
            tmp.replace(path)
            state['parts'] += 1
            state['kept'] += len(pending)
            pending = []
        state.update(gamesRead=read, eof=eof, seconds=state['seconds'] + time.perf_counter() - started)
        atomic_json(state_path, state)
        started = time.perf_counter()
    if state['kept'] < cap and not state['eof']:
        req = urllib.request.Request(URL.format(month=args.month), headers={'User-Agent': 'chess-coach-models'})
        with urllib.request.urlopen(req, timeout=60) as resp:
            reader = zstandard.ZstdDecompressor(max_window_size=2**31).stream_reader(resp, read_size=1 << 20)
            lines = io.TextIOWrapper(reader, encoding='utf-8')
            read = 0
            for read, (h, moves) in enumerate(pgn_records(lines), 1):
                if read <= resume_read:
                    continue
                row = keep(h, moves)
                if row is not None:
                    pending.append(row)
                if state['kept'] + len(pending) >= cap:
                    checkpoint(read)
                    break
                if len(pending) >= 100:
                    checkpoint(read)
                    print(json.dumps({k: state[k] for k in ('gamesRead', 'kept', 'seconds')}), flush=True)
            else:
                checkpoint(read, eof=True)
    output = directory / f'games-{args.month}.jsonl.gz'
    tmp = output.with_suffix('.tmp')
    with tmp.open('wb') as out:
        for i in range(state['parts']):
            with (chunks / f'{i:06d}.jsonl.gz').open('rb') as src:
                while data := src.read(1 << 20):
                    out.write(data)
    tmp.replace(output)
    pin = json.loads((LAB / 'bridge/chess.json').read_text())['commit']
    summary = {**state, 'app': pin, 'month': args.month, 'run': args.run,
               'url': URL.format(month=args.month),
               'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
               'cap': cap, 'complete': state['kept'] == cap or state['eof']}
    atomic_json(directory / f'games-{args.month}.json', summary)
    print(json.dumps(summary), flush=True)

if __name__ == '__main__':
    main()
