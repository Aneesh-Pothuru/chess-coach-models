#!/usr/bin/env python3
"""Price the frozen run from measured counts, timings and a count-only kernel.
No move outcomes or think times are read by this script.
"""
import json
import math
import os
import time
from pathlib import Path
for thread_variable in ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS']:
    os.environ[thread_variable] = '1'
import numpy as np

HERE = Path(__file__).resolve().parent
LAB = HERE.parents[1]
PRIVATE = LAB/'private/think-time-budget'
RESULTS = HERE/'results'
p = json.loads((RESULTS/'phase1.json').read_text())
c = json.loads((RESULTS/'cohort-counts.json').read_text())
assert p['effectsComputed'] is False
assert c['fingerprint'] == p['cohortFingerprint'], 'count and cost cohorts differ'
assert c['appCommit'] == p['appCommit'] and c['months'] == p['months'], 'count and cost sources differ'
players = p['bootstrapPlayers']
draws = p['rule']['draws']
started = time.perf_counter()
rng = np.random.default_rng(p['rule']['seed'])
w = np.empty((draws, players), dtype='float32')
for i in range(0, draws, 100):
    w[i:i+100] = rng.poisson(1., (min(100, draws-i), players))
allocation = time.perf_counter()-started
# Counts only. This times the same dimensions as the later weighted means;
# the two columns are constant counts, never a serious-error or think column.
x = np.ones((players, 2), dtype='float64')
started = time.perf_counter()
for i in range(0, draws, 100):
    result = w[i:i+100] @ x
    assert np.isfinite(result).all()
kernel = time.perf_counter()-started
# Registered estimates (two checks + two per comparison), plus descriptions:
# fifteen moments in primary, six trend bands, and two sensitivities.
estimates = 2 + 2*(len(p['rule']['triggers'])+len(p['rule']['candidates'])) + 15*9
matching = p['timing']['matchingSeconds']
# Effect aggregation adds two grouped means to the measured count grouping.
# Report a range instead of pretending the count-only kernel is an effect run.
low = p['timing']['loadAndPrepareSeconds'] + allocation + estimates*kernel + matching*estimates/15
high = p['timing']['loadAndPrepareSeconds'] + allocation + estimates*kernel*3 + matching*estimates/15*3
benchmark = []
for f in sorted(PRIVATE.glob('benchmark-*/build-*.json')):
    b = json.loads(f.read_text())
    if not b['balancedBenchmarkComplete']:
        continue
    ident = b['identity']
    pattern = f"moves-{ident['month']}-{ident['shard']}of{ident['shards']}-*.json"
    chunks = [json.loads(x.read_text()) for x in sorted(f.parent.glob(pattern))]
    assert len(chunks) == b['chunksBuilt'] + b['chunksResumed']
    assert all(x['identity'] == ident for x in chunks)
    benchmark.append({'month': b['identity']['month'], 'shard': b['identity']['shard'],
                      'shards': b['identity']['shards'], 'games': b['gamesBuilt'],
                      'gamesByBudget': b['selectedBudget'], 'seconds': sum(x['seconds'] for x in chunks),
                      'inputSha256': ident['inputSha256'],
                      'blackBuildsChecked': b['blackBuildsChecked'], 'appCommit': b['identity']['appCommit']})
assert benchmark, 'run a balanced bridge timing slice first'
assert all(b['appCommit'] == p['appCommit'] for b in benchmark)
worker_seconds = sum(b['seconds'] for b in benchmark)
bench_games = sum(b['games'] for b in benchmark)
bridge_projected = worker_seconds/bench_games*p['gamesBuilt']/2
sources = c['sources']
source_full = {m: s['seconds']*s['archiveBytes']/s['compressedOffset'] for m,s in sources.items()}


def source_schedule(seconds_by_month):
    """Initial two sources overlap; any later month follows them alone."""
    seconds = [seconds_by_month[month] for month in c['months']]
    return max(seconds[:2], default=0.) + sum(seconds[2:])


full_stream_time = source_schedule(source_full)
prefix_stream_time = source_schedule({month: state['seconds'] for month, state in sources.items()})

# sample.py logs a JSON summary for each cohort pass, including passes at
# earlier prefixes. Count their measured work, not their elapsed timestamps.
# The final cohort export was rerun outside this log; add its own timing.
sample_log = PRIVATE/'sample.log'
assert sample_log.is_file(), 'sample.log is needed to price the cohort count passes'
cohort_log_seconds = 0.
cohort_log_passes = 0
with sample_log.open() as source:
    for line in source:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if not isinstance(row, dict) or not {'byK', 'months', 'seconds', 'fingerprint'} <= row.keys():
            continue
        months = row['months']
        if months != c['months'][:len(months)]:
            continue
        if row.get('uniqueGames', 0) > c['uniqueGames']:
            continue
        seconds = float(row['seconds'])
        assert math.isfinite(seconds) and seconds >= 0, 'invalid cohort count timing'
        cohort_log_seconds += seconds
        cohort_log_passes += 1
assert cohort_log_passes, 'sample.log contains no cohort count timings for these sources'
final_cohort_seconds = float(c['seconds'])
assert math.isfinite(final_cohort_seconds) and final_cohort_seconds >= 0

# These are separate passes. The phase-one load and matching create the
# count report; low/high already contain the second load and estimated
# outcome grouping for phase two. Do not add that second work again.
scratch_components = {
    'sourcePrefixIdealSchedule': prefix_stream_time,
    'loggedCohortCounts': cohort_log_seconds,
    'finalCohortExport': final_cohort_seconds,
    'bridgeIdealTwoProcesses': p['timing']['bridgeTwoProcessIdealSeconds'],
    'phaseOneLoadAndPrepare': p['timing']['loadAndPrepareSeconds'],
    'dangerFitAndScore': p['danger']['seconds'],
    'phaseOneCountMatching': matching,
}
scratch_base = sum(scratch_components.values())
scratch_total = {'low': scratch_base + low, 'high': scratch_base + high}

# Measured worker-process spans are distinct from chunk work / two. A
# summary rewritten on resume describes that invocation only, so it cannot
# establish the original full build's elapsed time.
bridge_processes = []
for month in c['months']:
    paths = sorted((PRIVATE/'facts').glob(f'build-{month}-*.json'))
    assert paths, 'missing full-build summaries'
    for path in paths:
        build = json.loads(path.read_text())
        ident = build['identity']
        assert ident['appCommit'] == p['appCommit'], 'bridge process timing app differs'
        assert ident['inputSha256'] == c['exports'][month]['sha256'], 'bridge process timing cohort differs'
        record = {'month': month, 'shard': ident['shard'], 'shards': ident['shards'],
                  'chunksResumed': build['chunksResumed']}
        for key in ['workerElapsedSeconds', 'processStartedEpochMs', 'processEndedEpochMs']:
            value = build.get(key)
            record[key] = value if isinstance(value, (int, float)) and math.isfinite(value) else None
        if record['workerElapsedSeconds'] is not None:
            assert record['workerElapsedSeconds'] >= 0
        if record['processStartedEpochMs'] is not None and record['processEndedEpochMs'] is not None:
            assert record['processEndedEpochMs'] >= record['processStartedEpochMs']
        bridge_processes.append(record)
all_worker_times = all(row['workerElapsedSeconds'] is not None for row in bridge_processes)
all_process_spans = all(row['processStartedEpochMs'] is not None and row['processEndedEpochMs'] is not None
                        for row in bridge_processes)
spans_by_month = None
if all_process_spans:
    spans_by_month = {}
    for month in c['months']:
        rows = [row for row in bridge_processes if row['month'] == month]
        spans_by_month[month] = (max(row['processEndedEpochMs'] for row in rows)
                                 - min(row['processStartedEpochMs'] for row in rows))/1000
observed_bridge = {
    'processes': bridge_processes,
    'workerElapsedSeconds': sum(row['workerElapsedSeconds'] for row in bridge_processes) if all_worker_times else None,
    'processSpanSecondsByMonth': spans_by_month,
    'summedMonthProcessSpansSeconds': sum(spans_by_month.values()) if spans_by_month is not None else None,
    'allRecordedInvocationsBuiltWithoutResuming': all(row['chunksResumed'] == 0 for row in bridge_processes),
    'caveat': 'Observed latest Node worker invocations, including their startup and import time. Monthly spans run from first worker start to last worker end and are summed because months run sequentially. They exclude gaps between months and the bridge shell lookup before Node starts. A resumed summary omits earlier invocations; ideal chunk-work / two is not measured elapsed time.',
}
r = {'phase': 1, 'effectsComputed': False, 'appCommit': p['appCommit'], 'months': p['months'],
     'fingerprint': p['fingerprint'], 'players': players, 'bootstrapDraws': draws,
     'countOnlyBootstrapAllocationSeconds': allocation, 'countOnlyWeightedKernelSeconds': kernel,
     'estimatedMeanPasses': estimates, 'effectPassEstimateSeconds': {'low': low, 'high': high},
     'effectPassEstimateCaveat': 'Count-only arithmetic and grouping projection; no effect pass has run. Cached danger is reused. Includes descriptions and sensitivities; IO, thermal throttling and table generation vary.',
     'fromScratchFrozenPrefixEstimateSeconds': scratch_total,
     'fromScratchComponentsSeconds': scratch_components,
     'fromScratchCaveat': 'Approximate ideal schedule from the frozen source prefixes through the separate phase-one count and phase-two effect passes. Initial source pair overlaps; later sources are sequential. Source active time and bridge chunk work exclude pauses and startup outside the recorded work; two-process projections do not measure elapsed time or add an allowance for launch skew, contention or heat. Cohort count log timings plus the separately rerun final export are included. Optional pilot builds and report generation are excluded; no separate allowance is added for future retries. The phase-two term is projected from outcomes-free arithmetic and grouping only; no effect run has occurred.',
     'cohortTiming': {'loggedPasses': cohort_log_passes, 'loggedSeconds': cohort_log_seconds,
                      'finalExportSecondsAddedSeparately': final_cohort_seconds},
     'bridgeBenchmark': benchmark, 'bridgeSliceTwoProcessProjectionSeconds': bridge_projected,
     'bridgeActualWorkerSeconds': p['timing']['bridgeWorkerSeconds'],
     'bridgeActualIdealTwoProcessSeconds': p['timing']['bridgeTwoProcessIdealSeconds'],
     'bridgeObservedProcesses': observed_bridge,
     'dangerMeasuredSeconds': p['danger']['seconds'],
     'streamMeasuredWorkerSeconds': sum(s['seconds'] for s in sources.values()),
     'frozenPrefixStreamIdealScheduleSeconds': prefix_stream_time,
     'fullArchiveStreamProjectionSecondsByMonth': source_full,
     'fullArchiveStreamProjectionTwoProcessesSeconds': full_stream_time}
(RESULTS/'cost.json').write_text(json.dumps(r, indent=2)+'\n')
out = ['# Run cost', '', f"Written by `cost.py`; app `{p['appCommit']}`; frozen input `{p['fingerprint']}`; data {', '.join(p['months'])}.", '',
       f"Balanced bridge slice: {bench_games:,} games, {worker_seconds:.2f} worker-seconds; projects {bridge_projected/60:.1f} minutes for {p['gamesBuilt']:,} games with two processes.",
       f"The actual count build used {p['timing']['bridgeWorkerSeconds']/60:.1f} worker-minutes, or {p['timing']['bridgeTwoProcessIdealSeconds']/60:.1f} ideal minutes with two processes. Both use nice priority; elapsed time can rise under contention and heat.",
       f"Fixed danger fit and scoring: {p['danger']['seconds']:.1f} seconds at one thread. Count matching: {matching:.2f} seconds.",
       f"A count-only {draws:,}-draw player kernel took {allocation:.2f} seconds to allocate and {kernel:.3f} seconds per weighted two-column pass. No outcome or think column was read.",
       f"Phase two from the saved facts and nuisance scores is projected at {low/60:.1f}–{high/60:.1f} minutes for the effect pass and its descriptions. This is a count-arithmetic estimate, not a measured effect run.",
       f"Approximate total from scratch for the frozen source prefixes through phase two: {scratch_total['low']/60:.1f}–{scratch_total['high']/60:.1f} minutes under the ideal two-process schedule. This includes {prefix_stream_time/60:.1f} minutes for the source prefixes (the first two simultaneous; later months sequential), {cohort_log_seconds/60:.1f} minutes for {cohort_log_passes} logged cohort count passes, and {final_cohort_seconds/60:.1f} minutes for the final cohort export rerun outside that log. It adds bridge chunk work divided by two, the phase-one load, danger fit and count matching, and the phase-two range above. The two loads belong to separate count and effect passes; the phase-two grouping is counted only in its own range.",
       "This total is a projection, not observed wall time. It excludes pauses, unmeasured startup, launch imbalance, an extra allowance for contention or heat, optional pilot builds and report generation. Only source/count/build timings and outcomes-free arithmetic were measured; no effect pass was run.",
       f"Full-month streaming, if ever needed, projects {full_stream_time/60:.1f} minutes with two processes at the observed rates. The registered sample stops at the reported prefixes; full months are not required.", '',
       'No engine or Maia search is needed: the app reads the supplied Lichess evaluations and board facts. No packages were installed.']
if observed_bridge['workerElapsedSeconds'] is not None:
    process_text = f"Recorded bridge worker processes used {observed_bridge['workerElapsedSeconds']/60:.1f} worker-minutes including Node startup and imports."
    if observed_bridge['summedMonthProcessSpansSeconds'] is not None:
        process_text += f" Their observed first-start to last-end spans, summed over the sequential months, were {observed_bridge['summedMonthProcessSpansSeconds']/60:.1f} minutes."
    process_text += " These measured process spans are reported separately from ideal chunk-work divided by two; gaps between months and the bridge shell lookup before Node are excluded."
    if not observed_bridge['allRecordedInvocationsBuiltWithoutResuming']:
        process_text += " Some summaries describe resumed invocations, so these spans omit their earlier process time and are not the full build's elapsed time."
    out.insert(6, process_text)
else:
    out.insert(6, 'Observed bridge process elapsed time is unavailable in these summaries. Chunk-work divided by two is an ideal projection, not a measured elapsed time.')
(RESULTS/'cost.md').write_text('\n\n'.join(out)+'\n')
print(json.dumps({'output': 'results/cost.json', 'effectPassEstimateMinutes': [low/60, high/60],
                  'fromScratchFrozenPrefixEstimateMinutes': [scratch_total['low']/60, scratch_total['high']/60]}))
