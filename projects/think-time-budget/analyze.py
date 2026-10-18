#!/usr/bin/env python3
"""Default: counts only. --effects is phase two and requires a committed rule.

The default path fits the fixed nuisance model to count high-danger moves,
then discards outcome columns before aggregation. It never estimates a
budget effect, an error rate, or a moment's mean think.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
for thread_variable in ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS']:
    os.environ[thread_variable] = '1'
import numpy as np
import pandas as pd
from study import RULE, TRIGGERS, CANDIDATES, prepare, danger, masks, cells, support

LAB = Path(__file__).resolve().parents[2]
PROJECT = Path(__file__).resolve().parent
PRIVATE = LAB / 'private/think-time-budget'
READ_COLUMNS = ['game', 'player', 'opponent', 'month', 'budget', 'increment', 'meanRating', 'rating', 'oppRating',
                'ply', 'color', 'think', 'clockBefore', 'graded', 'nonTrivial', 'bookExitPly',
                'trigger', 'phase', 'evalBefore', 'wpBefore', 'material', 'legalMoves', 'forcing',
                'hangingOwn', 'hangingOpp', 'inCheck', 'prevCapture', 'afterOppError', 'afterOwnError', 'serious']
TEXT_COLUMNS = ['game', 'player', 'opponent', 'month', 'budget', 'color', 'trigger', 'phase']


def clean(x):
    if isinstance(x, dict): return {str(k): clean(v) for k, v in x.items()}
    if isinstance(x, (tuple, list)): return [clean(v) for v in x]
    if isinstance(x, np.ndarray): return clean(x.tolist())
    if isinstance(x, np.generic): x = x.item()
    if isinstance(x, float) and not np.isfinite(x): return None
    return x


def write_json(path, x):
    tmp = path.with_suffix('.partial')
    tmp.write_text(json.dumps(clean(x), indent=2, allow_nan=False) + '\n')
    tmp.replace(path)


def load(months):
    files, summaries = [], []
    cohort = json.loads((PRIVATE/'cohort.json').read_text())
    if cohort['months'] != months: raise ValueError('cohort months differ')
    for month in months:
        builds = sorted((PRIVATE/'facts').glob(f'build-{month}-*.json'))
        if not builds: raise ValueError(f'no finished facts for {month}')
        meta = [json.loads(p.read_text()) for p in builds]
        n = meta[0]['identity']['shards']
        if sorted(s['identity']['shard'] for s in meta) != list(range(n)):
            raise ValueError('missing or duplicate shards')
        identities = {(s['identity']['appCommit'], s['identity']['inputSha256'], s['identity']['codeHash']) for s in meta}
        if len(identities) != 1: raise ValueError('mixed input or code identities')
        if meta[0]['identity']['inputSha256'] != cohort['exports'][month]['sha256']:
            raise ValueError('facts are not from the frozen cohort export')
        if any(s['skipped'] for s in meta):
            raise ValueError('bridge rejected kept games; repair the cohort using valid games before analysis')
        for s in meta:
            count = s['chunksBuilt'] + s['chunksResumed']
            stem = f"moves-{month}-{s['identity']['shard']}of{n}-"
            paths = sorted((PRIVATE/'facts').glob(stem+'*.csv.gz'))
            if len(paths) != count: raise ValueError('unexpected/missing fact chunks')
            files.extend(paths)
        summaries.extend(meta)
    pin = json.loads((LAB/'bridge/chess.json').read_text())['commit']
    if any(s['identity']['appCommit'] != pin for s in summaries): raise ValueError('app pin changed')
    identity = {'months': months, 'cohortFingerprint': cohort['fingerprint'],
                'builds': [s['identity'] for s in summaries], 'rule': RULE,
                'files': [(p.name, p.stat().st_size) for p in files],
                'studyCode': hashlib.sha256((PROJECT/'study.py').read_bytes()).hexdigest()}
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:20]
    types = {c: ('str' if c in TEXT_COLUMNS else 'float32') for c in READ_COLUMNS}
    types['meanRating'] = 'float64'
    d = pd.concat([pd.read_csv(p, usecols=READ_COLUMNS, dtype=types) for p in files], ignore_index=True)
    if d.duplicated(['game', 'color', 'ply']).any(): raise ValueError('duplicate move rows')
    constants = json.loads((PRIVATE/'app-constants.json').read_text())
    return d, summaries, fingerprint, constants


def phase1(d, primary, moment_masks, high, summaries, timing, fingerprint, months, constants, load_seconds):
    # The only think means allowed in phase one are overall by budget.
    overall = {}
    for name, select in [('eligible', np.ones(len(d), bool)), ('primary', primary)]:
        overall[name] = {}
        for b in ['fast', 'slow']:
            q = d.loc[select & d.budget.eq(b)]
            overall[name][b] = {'moves': len(q), 'players': q.player.nunique(),
                                 'meanThinkSeconds': float(q.think.mean()) if len(q) else None}
    safe = d.drop(columns=['serious', 'think'])
    tables = {}
    for name, select in [('eligible', np.ones(len(d), bool)), ('primary', primary)]:
        tables[name] = {}
        for key, mask in moment_masks.items():
            a = safe.loc[select & mask]
            counts = {b: int(a.budget.eq(b).sum()) for b in ['fast', 'slow']}
            p = a.groupby(['player', 'budget'], observed=True).size().unstack(fill_value=0)
            paired = int(((p.get('fast', 0) > 0) & (p.get('slow', 0) > 0)).sum()) if len(p) else 0
            tables[name][key] = {**counts, 'playersBothBudgets': paired}
    matching_start = time.monotonic()
    sets = {k: cells(safe, primary & m) for k, m in moment_masks.items()}
    supports = {k: support(c, sets['none'] if k in TRIGGERS+CANDIDATES else None)[1] for k, c in sets.items()}
    matching_seconds = time.monotonic()-matching_start
    by_month = {month: {b: int((primary & d.month.eq(month) & d.budget.eq(b)).sum())
                        for b in ['fast', 'slow']} for month in months}
    games = sum(s['gamesBuilt'] for s in summaries)
    chunk_meta = [json.loads(p.read_text()) for month in months for p in sorted((PRIVATE/'facts').glob(f'moves-{month}-*.json'))]
    build_seconds = sum(s['seconds'] for s in chunk_meta)
    return {'phase': 1, 'effectsComputed': False, 'appCommit': constants['appCommit'],
            'months': months, 'fingerprint': fingerprint,
            'cohortFingerprint': json.loads((PRIVATE/'cohort.json').read_text())['fingerprint'], 'rule': RULE,
            'gamesBuilt': games, 'timedMoves': sum(s['timedMoves'] for s in summaries),
            'bootstrapPlayers': int(d.player.nunique()),
            'blackBuildsChecked': sum(s['blackBuildsChecked'] for s in summaries),
            'clockMovesChecked': sum(s['clockMovesChecked'] for s in summaries),
            'overall': overall, 'moments': tables, 'support': supports, 'primaryMovesByMonth': by_month,
            'danger': timing, 'appConstants': constants,
            'timing': {'loadAndPrepareSeconds': load_seconds, 'matchingSeconds': matching_seconds,
                       'bridgeWorkerSeconds': build_seconds,
                       'bridgeTwoProcessIdealSeconds': build_seconds/2}}


def interval(x):
    x = np.asarray(x)
    if not np.isfinite(x).all(): return {'lo': None, 'hi': None, 'p': 1.}
    lo, hi = np.quantile(x, [.025, .975])
    p = min(1., 2*min((np.sum(x >= 0)+1)/(len(x)+1), (np.sum(x <= 0)+1)/(len(x)+1)))
    return {'lo': float(lo), 'hi': float(hi), 'p': float(p)}


def holm(ps):
    ix = np.argsort(ps, kind='stable')
    ans = np.ones(len(ps))
    largest = 0.
    for rank, i in enumerate(ix):
        largest = max(largest, (len(ps)-rank)*ps[i])
        ans[i] = min(1., largest)
    return ans.tolist()


class Bootstrap:
    def __init__(self, players):
        self.players = pd.Index(sorted(players))
        # uint8 would truncate extreme Poisson weights; float32 is exact here.
        self.weights = np.empty((RULE['draws'], len(self.players)), dtype='float32')
        rng = np.random.default_rng(RULE['seed'])
        for start in range(0, RULE['draws'], 100):
            self.weights[start:start+100] = rng.poisson(1., (min(100, RULE['draws']-start), len(self.players)))

    def means(self, frame, selected):
        idx = self.players.get_indexer(selected)
        if (idx < 0).any(): raise ValueError('unknown bootstrap player')
        x = frame.reindex(selected)[['err', 'think']].to_numpy()
        draws = np.empty((RULE['draws'], 2))
        for start in range(0, RULE['draws'], 100):
            w = self.weights[start:start+100, idx]
            den = w.sum(axis=1)
            with np.errstate(invalid='ignore', divide='ignore'):
                draws[start:start+100] = (w @ x) / den[:, None]
        return x.mean(axis=0) if len(x) else np.full(2, np.nan), draws


def estimate(c, selected, bootstrap):
    point, draws = bootstrap.means(c['effects'], selected)
    err = {'value': point[0], **interval(draws[:, 0])}
    think = {'value': point[1], **interval(draws[:, 1])}
    valid = think['lo'] is not None and think['lo'] >= RULE['thinkFloorSeconds'] and bool((draws[:, 1] > 0).all())
    ratio = -60*draws[:, 0]/draws[:, 1] if valid else np.full(len(draws), np.nan)
    v = {'value': -60*point[0]/point[1], **interval(ratio)} if valid else None
    return {'err': err, 'think': think, 'valuePerMinute': v, 'ratioIdentified': valid}, ratio


def effects(d, primary, moment_masks):
    """Not called by the default phase-one entry point."""
    bootstrap = Bootstrap(d.player.unique())
    sets = {k: cells(d, primary & m, effects=True) for k, m in moment_masks.items()}
    checks = {}
    for k in ['all', 'placebo']:
        selected, sup = support(sets[k])
        est, _ = estimate(sets[k], selected, bootstrap)
        checks[k] = {**est, 'support': sup}
    overall = checks['all']
    placebo = checks['placebo']
    overall_pass = overall['support']['sufficient'] and overall['err']['hi'] is not None and overall['err']['hi'] < 0
    e = placebo['err']
    enough = placebo['support']['sufficient'] and e['lo'] is not None
    placebo_pass = enough and e['lo'] > -RULE['placeboMargin'] and e['hi'] < RULE['placeboMargin']
    placebo_bad = enough and (e['hi'] < -RULE['placeboMargin'] or e['lo'] > RULE['placeboMargin'])
    checks['overallPass'] = overall_pass
    checks['placeboStatus'] = 'pass' if placebo_pass else 'untrustworthy' if placebo_bad else 'inconclusive'
    checks['gatesPass'] = overall_pass and placebo_pass
    comparisons = {}
    for family in [TRIGGERS, CANDIDATES]:
        ps = []
        for k in family:
            selected, sup = support(sets[k], sets['none'])
            est, dr = estimate(sets[k], selected, bootstrap)
            ordinary, dr0 = estimate(sets['none'], selected, bootstrap)
            identified = sup['sufficient'] and est['ratioIdentified'] and ordinary['ratioIdentified']
            cmp = {'value': est['valuePerMinute']['value']-ordinary['valuePerMinute']['value'], **interval(dr-dr0)} if identified else None
            comparisons[k] = {'moment': est, 'noneSamePlayers': ordinary, 'support': sup, 'contrast': cmp}
            ps.append(cmp['p'] if cmp else 1.)
        for k, ph in zip(family, holm(ps)):
            r = comparisons[k]
            cmp = r['contrast']
            verdict = 'cannot tell; leave unchanged'
            if checks['gatesPass'] and cmp is not None:
                if cmp['value'] > 0 and ph < RULE['alpha'] and r['moment']['err']['hi'] < 0:
                    verdict = 'keep' if k in TRIGGERS else 'add candidate'
                elif cmp['value'] < 0 and ph < RULE['alpha']:
                    verdict = 'drop priority' if k in TRIGGERS else 'do not add'
                else:
                    verdict = 'no established advantage; leave unchanged'
            r['pHolm'] = ph
            r['verdict'] = verdict
    # All descriptive runs reuse exactly the same player draws. None can
    # change the registered primary verdict.
    def describe(selection, *, strata=5):
        descriptions = {}
        for k, m in moment_masks.items():
            c = cells(d, selection & m, effects=True, strata=strata)
            selected, sup = support(c)
            est, _ = estimate(c, selected, bootstrap)
            raw = {}
            for b in ['fast', 'slow']:
                q = d.loc[selection & m & d.budget.eq(b)]
                raw[b] = {'moves': len(q), 'errorRate': float(q.serious.mean()),
                          'meanThinkSeconds': float(q.think.mean())}
            descriptions[k] = {**est, 'support': sup, 'rawMoveWeighted': raw}
        return descriptions
    standalone = describe(primary)
    trend = {f'{lo}-{lo+199}': describe((d.meanRating.ge(lo) & d.meanRating.lt(lo+200)).to_numpy())
             for lo in [900, 1100, 1300, 1500, 1700, 1900]}
    zero = (d.budget.eq('fast') | d.increment.eq(0)).to_numpy()
    sensitivity = {'tenStrata': describe(primary, strata=10),
                   'zeroIncrementSlow': describe(primary & zero)}
    from sklearn.metrics import roc_auc_score
    quick = d.think.lt(json.loads((PRIVATE/'app-constants.json').read_text())['RUSHED_SECONDS'])
    diagnostics = {}
    for b in ['fast', 'slow']:
        q = d.loc[quick & d.budget.eq(b)]
        diagnostics[b] = {'moves': len(q), 'brier': float(((q.danger-q.serious)**2).mean()),
                          'auc': float(roc_auc_score(q.serious, q.danger)) if q.serious.nunique() == 2 else None}
    return {'checks': checks, 'comparisons': comparisons, 'standalone': standalone,
            'trend': trend, 'sensitivity': sensitivity, 'dangerDiagnostics': diagnostics}


def markdown(r):
    out = ['# Clock budget: phase-one counts', '',
           f"Written by `analyze.py` on app `{r['appCommit']}`. Data: {', '.join(r['months'])}; stream prefixes and cohort selection are in `cohort-counts.md`.", '',
           'No budget effect, error rate, per-moment mean think, bootstrap interval or trigger verdict was computed.', '',
           f"Built {r['gamesBuilt']:,} games; {r['timedMoves']:,} timed moves. Checked {r['blackBuildsChecked']:,} real Black builds and {r['clockMovesChecked']:,} clock readings.", '',
           '| Set | Budget | Moves | Players | Overall mean think (s) |', '|---|---|---:|---:|---:|']
    for name, row in r['overall'].items():
        for b, v in row.items():
            mean = 'n/a' if v['meanThinkSeconds'] is None else f"{v['meanThinkSeconds']:.3f}"
            out.append(f"| {name} | {b} | {v['moves']:,} | {v['players']:,} | {mean} |")
    out += ['', '| Primary moment | Fast moves | Slow moves | Players both budgets | Supported players | Fast coverage: moment / none |', '|---|---:|---:|---:|---:|---|']
    for k, v in r['moments']['primary'].items():
        s = r['support'][k]
        out.append(f"| {k} | {v['fast']:,} | {v['slow']:,} | {v['playersBothBudgets']:,} | {s['supportedPlayers']:,} | {' / '.join(f'{x:.1%}' for x in s['coverage'])} |")
    t = r['timing']
    out += ['', f"Bridge work: {t['bridgeWorkerSeconds']:.1f} worker-seconds; ideal two-process time {t['bridgeTwoProcessIdealSeconds']/60:.1f} minutes. Load and prepare: {t['loadAndPrepareSeconds']:.1f} seconds. Fixed danger fit and scoring: {r['danger']['seconds']:.1f} seconds at one thread.", '',
            'Trigger and candidate support is paired to none. All-move, placebo and standalone none support is unpaired.',
            'High-danger membership comes from the fixed cross-fitted nuisance model. Only its counts and run time are reported. Scores, cell boundaries and move rows stay private.']
    return '\n'.join(out)+'\n'


def effect_markdown(r):
    def ci(v, scale=1):
        if v is None or v['value'] is None or not np.isfinite(v['value']): return 'cannot tell'
        point = f"{scale*v['value']:+.3f}"
        if v['lo'] is None: return point+' (interval unavailable)'
        return f"{point} ({scale*v['lo']:+.3f} to {scale*v['hi']:+.3f})"
    out = ['# Clock budget: effect estimates', '',
           f"Written by `analyze.py` on app `{r['appCommit']}`; data {', '.join(r['months'])}; frozen input `{r['fingerprint']}`.", '',
           'Differences are slow minus fast. Error differences use percentage points; thinks use seconds; value uses serious errors saved per extra minute. Intervals are the fixed player bootstrap.', '',
           '| Check | Δ errors (pp) | Matched players | Coverage |', '|---|---|---:|---:|']
    for k in ['all', 'placebo']:
        c = r['checks'][k]
        out.append(f"| {k} | {ci(c['err'],100)} | {c['support']['supportedPlayers']:,} | {c['support']['coverage'][0]:.1%} |")
    out += ['', f"Overall check passed: {r['checks']['overallPass']}. Placebo: {r['checks']['placeboStatus']}. Both gates passed: {r['checks']['gatesPass']}.", '',
            '| Moment | Δ errors (pp) | Δ think (s) | Value / minute | Value minus paired none | Holm p | Verdict |', '|---|---|---|---|---|---:|---|']
    for k,c in r['comparisons'].items():
        a = c['moment']
        out.append(f"| {k} | {ci(a['err'],100)} | {ci(a['think'])} | {ci(a['valuePerMinute'])} | {ci(c['contrast'])} | {c['pHolm']:.5f} | {c['verdict']} |")
    out += ['', '| Moment | Paired players before matching | Matched players | Fast coverage: moment / none | Paired none Δ errors (pp) | Paired none Δ think (s) | Paired none value |', '|---|---:|---:|---|---|---|---|']
    for k,c in r['comparisons'].items():
        s, a = c['support'], c['noneSamePlayers']
        out.append(f"| {k} | {s['pairedPlayers']:,} | {s['supportedPlayers']:,} | {' / '.join(f'{v:.1%}' for v in s['coverage'])} | {ci(a['err'],100)} | {ci(a['think'])} | {ci(a['valuePerMinute'])} |")
    out += ['', 'Descriptions only, on each moment’s own supported players:', '',
            '| Moment | Raw fast error rate | Raw slow error rate | Δ errors (pp) | Δ think (s) | Value / minute |', '|---|---:|---:|---|---|---|']
    for k,c in r['standalone'].items():
        raw = c['rawMoveWeighted']
        out.append(f"| {k} | {100*raw['fast']['errorRate']:.2f}% | {100*raw['slow']['errorRate']:.2f}% | {ci(c['err'],100)} | {ci(c['think'])} | {ci(c['valuePerMinute'])} |")
    out += ['', 'Rating trend: Δ errors in percentage points, described without a rule.', '',
            '| Mean rating | none | '+ ' | '.join(TRIGGERS)+' |', '|---|'+'---|'*5]
    for band,row in r['trend'].items():
        out.append('| '+band+' | '+' | '.join(ci(row[k]['err'],100) for k in ['none']+TRIGGERS)+' |')
    out += ['', 'Sensitivity descriptions: Δ errors in percentage points; they do not change the verdict.', '',
            '| Moment | Ten strata | Zero-increment slow |', '|---|---|---|']
    for k in ['none']+TRIGGERS+CANDIDATES:
        out.append(f"| {k} | {ci(r['sensitivity']['tenStrata'][k]['err'],100)} | {ci(r['sensitivity']['zeroIncrementSlow'][k]['err'],100)} |")
    out += ['', 'The JSON report also contains full trend and sensitivity thinks, values, support and model diagnostics. The ratio is an observational budget association, not a causal return to assigning extra time to a move.']
    return '\n'.join(out)+'\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--months', nargs='+', default=['2026-09', '2026-08'])
    ap.add_argument('--effects', action='store_true', help='PHASE TWO ONLY: apply the committed rule')
    args = ap.parse_args()
    if args.effects:
        # Verify the committed content freeze before opening any private move data.
        from freeze import check_manifest
        try:
            check_manifest(require_committed=True)
        except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
            raise SystemExit(str(exc)) from None
    started = time.monotonic()
    raw, summaries, fingerprint, constants = load(args.months)
    d = prepare(raw)
    del raw
    load_seconds = time.monotonic()-started
    d['danger'], timing = danger(d, constants['RUSHED_SECONDS'], PRIVATE, fingerprint)
    primary, moment_masks, high = masks(d, constants['RUSHED_SECONDS'])
    if args.effects:
        frozen = json.loads((PROJECT/'results/phase1.json').read_text())
        if frozen['fingerprint'] != fingerprint or frozen['rule'] != RULE:
            raise SystemExit('phase two requires the same data and rule as the phase-one count')
        r = {'phase': 2, 'appCommit': constants['appCommit'], 'months': args.months,
             'fingerprint': fingerprint, 'rule': RULE, **effects(d, primary, moment_masks)}
        write_json(PROJECT/'results/analysis.json', r)
        (PROJECT/'results/analysis.md').write_text(effect_markdown(r))
    else:
        r = phase1(d, primary, moment_masks, high, summaries, timing, fingerprint, args.months, constants, load_seconds)
        write_json(PROJECT/'results/phase1.json', r)
        (PROJECT/'results/phase1.md').write_text(markdown(r))
    print(json.dumps({'phase': r['phase'], 'seconds': round(time.monotonic()-started, 2), 'output': 'analysis' if args.effects else 'phase1'}))

if __name__ == '__main__': main()
