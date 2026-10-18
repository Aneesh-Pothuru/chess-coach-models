#!/usr/bin/env python3
"""Archive the stopped scan and freeze its reusable readings by content hash.

Run once after all old workers have stopped. Repeating this command verifies
the same frozen inputs and finishes any interrupted archive moves.
"""
from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
from freeze import LAB, PROJECT

FULL = LAB / 'private/rules-of-thumb/full'
ARCHIVE = LAB / 'private/rules-of-thumb/legacy-literal'
MANIFEST = PROJECT / 'migration-manifest.json'

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def main():
    if list(FULL.glob('scored-*.jsonl')):
        raise ValueError('cannot migrate after a position has been scored')
    # Inspect only commands belonging to this project, never unrelated jobs.
    commands = subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True)
    for command in commands.splitlines():
        if str(PROJECT) in command and any(name in command for name in
                ('run_phase2.py', 'positions.mjs', 'backfill.mjs', 'score.mjs')):
            raise ValueError('project worker still running; stop it before archiving')
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    else:
        frozen = json.loads((PROJECT / 'phase2-manifest.json').read_text())
        if frozen['datasetKind'] != 'literal':
            raise ValueError('expected the original literal content manifest')
        manifest = {'schema': 1, 'app': frozen['app'], 'records': frozen['records'],
            'legacyRule': frozen['rule'], 'legacyCodeSha256': frozen['files'],
            'months': {}}
        for path in sorted(FULL.glob('availability-*.jsonl')):
            meta = json.loads(Path(str(path) + '.meta.json').read_text())
            games = positions = partial = 0
            with path.open('rb') as source:
                for line in source:
                    if not line.endswith(b'\n'):
                        partial = len(line)
                        continue
                    record = json.loads(line)
                    if record['gameIndex'] != meta['shard'] + games * meta['shards']:
                        raise ValueError('legacy journal is not a contiguous shard prefix')
                    games += 1
                    positions += record['counts']['positions']
            version = manifest.setdefault('legacyScannerVersion', meta['version'])
            if meta['version'] != version or meta['app'] != frozen['app']:
                raise ValueError('legacy scanners or app pins differ')
            month = manifest['months'].setdefault(meta['month'], {
                'inputSha256': meta['inputSha256'], 'shards': meta['shards'], 'journals': []})
            month['journals'].append({'shard': meta['shard'],
                'path': (ARCHIVE / path.name).relative_to(LAB).as_posix(),
                'sha256': sha(path), 'games': games, 'positions': positions,
                'partialTrailingBytes': partial})
        if not manifest['months']:
            raise ValueError('no old journals to archive')
        temporary = MANIFEST.with_suffix('.json.partial')
        temporary.write_text(json.dumps(manifest, indent=2) + '\n')
        temporary.replace(MANIFEST)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    for month in manifest['months'].values():
        for journal in month['journals']:
            target = LAB / journal['path']
            source = FULL / target.name
            existing = target if target.exists() else source
            if sha(existing) != journal['sha256']:
                raise ValueError('legacy journal content differs from the frozen manifest')
            if source.exists() and target.exists():
                raise ValueError('both old and new journal paths exist; do not overwrite either')
            if source.exists():
                source.replace(target)
            for suffix in ('.meta.json', '.progress.json', '.complete.json'):
                source_meta, target_meta = Path(str(source) + suffix), Path(str(target) + suffix)
                if source_meta.exists():
                    if target_meta.exists():
                        raise ValueError('archive metadata already exists')
                    source_meta.replace(target_meta)
    events_path = FULL / 'stage-events.jsonl'
    if events_path.exists():
        events = [json.loads(line) for line in events_path.read_text().splitlines()]
        ended = {event.get('attempt') for event in events if event['event'] in ('completed', 'stopped')}
        pending = [event for event in events if event['event'] == 'started'
                   and event['stage'] == 'positions' and event['attempt'] not in ended]
        with events_path.open('a') as out:
            for event in pending:
                # The reviewer reports SIGTERM; its exact wall-clock instant
                # was not captured by the killed driver. Never invent a time.
                out.write(json.dumps({'at': datetime.now(timezone.utc).isoformat(),
                    'stage': event['stage'], 'month': event['month'], 'attempt': event['attempt'],
                    'event': 'stopped', 'seconds': None, 'exitCode': -15,
                    'stopReason': 'reviewer-amendment-sigterm', 'terminationTimeKnown': False}) + '\n')
    print(json.dumps({'archivedGames': sum(j['games'] for m in manifest['months'].values() for j in m['journals']),
                      'archivedPositions': sum(j['positions'] for m in manifest['months'].values() for j in m['journals'])}))

if __name__ == '__main__':
    main()
