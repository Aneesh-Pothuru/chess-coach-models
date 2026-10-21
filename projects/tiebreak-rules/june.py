#!/usr/bin/env python3
"""Streams June 2026 Lichess games through rules-of-thumb's filter, for the
availability count only: June is outside the study's months. Writes the first
--games kept games, in file order, to private/tiebreak-rules/june/games.jsonl."""
from __future__ import annotations
import argparse
import io
import json
from pathlib import Path
import re
import urllib.request
import zstandard

LAB = Path(__file__).resolve().parents[2]
URL = 'https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst'
RESULTS = ('1-0', '0-1', '1/2-1/2', '*')


def records(lines):
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


def sans(movetext):
    text = re.sub(r'\$\d+', ' ', re.sub(r'\{[^}]*\}', ' ', movetext))
    out = []
    for token in text.split():
        if re.fullmatch(r'\d+\.(\.\.)?', token) or token in RESULTS:
            continue
        token = re.sub(r'^\d+\.+', '', token).rstrip('?!')
        if token:
            out.append(token)
    return out


def keep(h, movetext):
    if not h.get('Event', '').startswith('Rated ') or h.get('Variant', 'Standard') != 'Standard' or 'FEN' in h:
        return None
    if h.get('TimeControl') != '600+0' or h.get('Termination') not in ('Normal', 'Time forfeit'):
        return None
    try:
        white, black = int(h['WhiteElo']), int(h['BlackElo'])
    except (KeyError, ValueError):
        return None
    if not (1250 <= white <= 1649 and 1250 <= black <= 1649):
        return None
    moves = sans(movetext)
    if len(moves) < 30:
        return None
    return dict(whiteElo=white, blackElo=black, sans=moves)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--games', type=int, default=600)
    args = ap.parse_args()
    out_path = LAB / 'private' / 'tiebreak-rules' / 'june' / 'games.jsonl'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    kept = seen = 0
    with urllib.request.urlopen(URL) as response, open(out_path, 'w') as out:
        text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(response), encoding='utf-8', errors='replace')
        for headers, movetext in records(text):
            seen += 1
            game = keep(headers, movetext)
            if game is None:
                continue
            out.write(json.dumps(game) + '\n')
            kept += 1
            if kept >= args.games:
                break
    print(json.dumps(dict(seen=seen, kept=kept)))


if __name__ == '__main__':
    main()
