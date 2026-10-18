#!/usr/bin/env python3
"""Write a counts-and-timings report, never read a real score or verdict."""
import json
from pathlib import Path

LAB = Path(__file__).resolve().parents[2]
PROJECT = Path(__file__).resolve().parent
DIR = LAB / 'private/rules-of-thumb/slice'

def main():
    stream = json.loads((DIR / 'games-2026-07.json').read_text())
    positions = json.loads((DIR / 'positions-2026-07.json').read_text())
    timing = json.loads((DIR / 'timing-2026-07-0-of-1.json').read_text())
    pin = json.loads((LAB / 'bridge/chess.json').read_text())['commit']
    assert all(x['complete'] and x['run'] == 'slice' and x['month'] == '2026-07' and x['app'] == pin for x in (stream, positions, timing))
    assert timing['timing'] and timing['shards'] == 1
    assert timing['inputSha256'] == positions['outputSha256']
    assert positions['inputSha256'] == stream['outputSha256']
    assert stream['kept'] == positions['games'] == 300
    assert timing['rows'] == 60
    # The only journal this report reads is the timing-only journal. Reject
    # any accidental score-bearing field before generating a public report.
    records = [json.loads(line) for line in (DIR / 'timing-2026-07-0-of-1.jsonl').read_text().splitlines()]
    assert len(records) == timing['rows']
    assert all(set(row) == {'key', 'times'} for row in records)
    total = timing['totals']
    counts = {k: positions[k] for k in ('games', 'plies', 'positions', 'legalMoves', 'describeMoveCalls', 'keptPositions', 'kept', 'availableGames')}
    multiplier = 30000 / positions['games']
    retained = {rule: min(4000, count * multiplier) for rule, count in positions['availableGames'].items()}
    projected_rows = 3 * sum(retained.values())
    factor = projected_rows / timing['rows']
    projected = {
        'games': 90000, 'workers': 3, 'retainedRows': projected_rows,
        'retainedPerMonthByRule': retained,
        'eligiblePositions': positions['positions'] * multiplier * 3,
        'describeMoveCalls': positions['describeMoveCalls'] * multiplier * 3,
        'streamSeconds': stream['seconds'] * multiplier * 3,
        'availabilityWorkerSeconds': positions['timing']['seconds'] * multiplier * 3,
        'describeMoveWorkerSeconds': positions['timing']['describeMoveSeconds'] * multiplier * 3,
        'maiaWorkerSeconds': total['maiaSeconds'] * factor,
        'engineWorkerSeconds': total['engineSeconds'] * factor,
        'tablebaseWorkerSeconds': total['tablebaseSeconds'] * factor,
    }
    keys = ['availabilityWorkerSeconds', 'maiaWorkerSeconds', 'engineWorkerSeconds', 'tablebaseWorkerSeconds']
    projected['workerHours'] = sum(projected[k] for k in keys) / 3600
    projected['idealWallHours'] = projected['workerHours'] / 3 + projected['streamSeconds'] / 3600
    projected['dominantStep'] = max(keys, key=lambda k: projected[k]).removesuffix('WorkerSeconds')
    ceiling_rows = 17 * 4000 * 3
    projected['allRuleCapsRows'] = ceiling_rows
    projected['allRuleCapsWallHours'] = ((projected['availabilityWorkerSeconds'] + sum(total[k] for k in ('maiaSeconds', 'engineSeconds', 'tablebaseSeconds')) * ceiling_rows / timing['rows']) / 3 + projected['streamSeconds']) / 3600
    out = {'app': pin, 'phase': 'counts and timings only', 'data': {'month': '2026-07', 'source': stream['url'], 'gamesRead': stream['gamesRead'], 'gamesKept': stream['kept'], 'sourceSha256': stream['outputSha256'], 'positionsSha256': positions['outputSha256']},
           'counts': counts, 'streamSeconds': stream['seconds'], 'availability': {'workers': positions['shards'], 'wallSeconds': positions['wallSeconds'], **positions['timing']},
           'refereeTiming': {'rows': timing['rows'], 'workers': timing['shards'], **total, 'firstRow': records[0]['times'], 'wallSeconds': timing['workerSecondsThisInvocation']},
           'projection': projected, 'packagesInstalled': []}
    result = PROJECT / 'results'
    result.mkdir(exist_ok=True)
    (result / 'phase1.json').write_text(json.dumps(out, indent=2) + '\n')
    lines = ['# Rules of thumb: implementation and timing', '',
        f"Written by `phase1.py`. App `{pin}`. Data: the first {stream['kept']:,} eligible July 2026 Lichess rated standard 600+0 games, both players 1250 to 1649, Normal or Time forfeit, at least 30 plies. The stream read {stream['gamesRead']:,} games. No August or September data were read.", '',
        'The fixed README is unchanged except for its files and commands. The streamer, complete availability scan, seeded position draw, monthly caps, app Maia/engine/tablebase scorer, game bootstrap, verdict logic, five splits and descriptive tree are implemented. The full analysis has not run. Real-game soundness, lift, adoption, failure conditions and verdicts were not calculated.', '',
        '| Step | Work | Seconds |', '|---|---:|---:|',
        f"| Stream | {stream['kept']:,} games kept / {stream['gamesRead']:,} read | {stream['seconds']:.3f} |",
        f"| Availability, wall time | {positions['shards']} workers | {positions['wallSeconds']:.3f} |",
        f"| Availability, summed worker work | {positions['positions']:,} positions / {positions['legalMoves']:,} legal moves | {positions['timing']['seconds']:.3f} |",
        f"| describeMove within availability | {positions['describeMoveCalls']:,} calls | {positions['timing']['describeMoveSeconds']:.3f} |",
        f"| Maia | {total['maiaCalls']:,} calls / {total['maiaBands']:,} band inferences | {total['maiaSeconds']:.3f} |",
        f"| Stockfish | {total['bestCalls']:,} best searches / {total['scoreCalls']:,} move searches | {total['engineSeconds']:.3f} |",
        f"| Tablebase | {total['tablebaseCalls']:,} probes / {total['tablebaseUnavailable']:,} unavailable | {total['tablebaseSeconds']:.3f} |", '',
        f"The games contained {positions['plies']:,} plies. The draw retained {positions['keptPositions']:,} game-rule rows. Referee timing used {timing['rows']:,} evenly spaced retained rows, with one worker; its wall time was {timing['workerSecondsThisInvocation']:.3f} seconds. The first Maia call, including model loading, took {records[0]['times']['maiaSeconds']:.3f} seconds. The app's Node ONNX Maia and Stockfish build were used; no Python model or native Stockfish substitute was used.", '',
        '| Rule | Available positions | Games with availability | Kept rows |', '|---|---:|---:|---:|']
    for rule, kept in positions['kept'].items():
        lines.append(f"| {rule} | {positions['availability']['all']['rules'][rule]:,} | {positions['availableGames'][rule]:,} | {kept:,} |")
    lines += ['', f"For the full {projected['games']:,}-game cap, the slice projects {projected['eligiblePositions']:,.0f} eligible positions and {projected['describeMoveCalls']:,.0f} detector calls. Scaling each rule's available-game count and applying its monthly cap projects {projected_rows:,.0f} retained rows.", '',
        '| Full-run step | Worker hours | Ideal wall hours at three workers |', '|---|---:|---:|']
    for k in keys:
        lines.append(f"| {k.removesuffix('WorkerSeconds')} | {projected[k]/3600:.2f} | {projected[k]/10800:.2f} |")
    lines += ['', f"The stream estimate is {projected['streamSeconds']/60:.2f} minutes, run serially. The total is {projected['workerHours']:.2f} worker-hours and {projected['idealWallHours']:.2f} ideal wall-hours. **{projected['dominantStep'].capitalize()} dominates.** If every rule reached every monthly cap, {ceiling_rows:,} retained rows at the same average timing would give {projected['allRuleCapsWallHours']:.2f} ideal wall-hours. That is a workload scenario, not a latency bound.", '',
        'These estimates exclude analysis, final reporting and startup outside the measured calls. They are not a promise of sustained laptop throughput. The slice sampled a file prefix, not the month; rare-rule frequencies, thermal throttling, tablebase and network delays, concurrent work and restart re-streaming can change the cost. The JSON preserves first-call timing and all count denominators. No package was installed.', '',
        'Tests use synthetic inputs only: stream filter boundaries and multiline input; FEN/UCI detector cases for every rule; seeded draws and caps; referee score orientation, exactness, root integrity, tablebase outcomes and timing-mode nonmeasurement; clustered resampling, intervals, verdict boundaries, failures, tree fitting and full-input gates. The paper directory is a deferred scaffold. Its generator checks the timing-only status; it prints no study result.', '',
        (PROJECT / 'implementation-notes.md').read_text().replace('# Readings for review before the full scan', '## Readings for review before the full scan', 1),
        '## Exact phase 2 commands', '', 'Run only after the reviewer answers the readings above. The script runs three heavy workers at a time and resumes existing complete records.', '', '```bash', 'projects/rules-of-thumb/phase2.sh --reviewed', '```', '', 'Its commands are:', '', '```bash',
        'for month in ' + (PROJECT / 'phase2.sh').read_text().split('for month in ', 1)[1].strip(), '```', '',
        'The script stops after aggregate analysis. The answer and paper are written after the full run. No push is part of either phase.']
    (result / 'phase1.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps({'app': pin, 'counts': counts, 'projection': projected}))

if __name__ == '__main__':
    main()
