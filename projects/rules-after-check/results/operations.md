# Operations for rules after the check

Check app `3437a711843006926c0804394b9087c5a55d4bcf`. Referee app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. Records `aed714ada579782ce73630596e59c8b65e74cb30`.

The data are the inherited July, August and September Lichess rows in run `full`. This supplement reports execution only. The registered statistical control and its effect on verdicts are in `rules.md`; a failed statistical control is not an execution failure.

The driver completed in 4.706 UTC hours. All 12 completed journals and 38 original input files match their byte hashes. The original measurement freeze is unchanged.

| Stage | Month | Rows | UTC seconds | Python stage seconds | Worker seconds | Stops / pauses |
|---|---|---:|---:|---:|---:|---:|
| checked | 2026-07 | 42624 | 34.001 | 34.001 | 61.694 | 0 / 0 |
| checked | 2026-08 | 42572 | 31.424 | 31.424 | 56.633 | 0 / 0 |
| checked | 2026-09 | 42718 | 33.771 | 33.771 | 61.464 | 0 / 0 |
| scored | 2026-07 | 42624 | 5134.512 | 5134.499 | 10253.188 | 0 / 0 |
| scored | 2026-08 | 42572 | 5242.775 | 5242.802 | 10477.313 | 0 / 0 |
| scored | 2026-09 | 42718 | 6444.711 | 6444.720 | 12879.185 | 0 / 0 |
| analysis | all | — | 13.470 | 13.470 | — | 0 / 0 |
| examples | all | — | 3.345 | 3.345 | — | 0 / 0 |

The UTC interval comes from supervisor timestamps. The Python timer uses `time.monotonic()`. Their small signed differences are retained in JSON. Neither is CPU time. Stage timers include startup and cleanup but exclude the driver's preceding source check. Gaps between attempts are reported separately; no time is silently assigned to an unrecorded interval.

Worker seconds sum the two shard checkpoint timers. They exclude initial input joins and byte verification. Their timers use Node `performance.now()`, not the Python timer. Completed row times and failed attempt totals stay separate. A missing failed tail stays unknown. Instrument times are elapsed calls, not CPU time; engine seconds already include `newGameSeconds`.

| Month | Board reading seconds | Safety seconds | Split seconds | Maia seconds | Engine seconds | Stored-probe seconds |
|---|---:|---:|---:|---:|---:|---:|
| 2026-07 | 0.527 | 53.947 | 1.058 | 1470.355 | 8771.190 | 0.068 |
| 2026-08 | 0.487 | 49.830 | 0.875 | 1504.551 | 8960.640 | 0.067 |
| 2026-09 | 0.546 | 53.482 | 1.110 | 1753.497 | 11111.891 | 0.098 |

The worker manifests record 0 stops, 0 interrupted-job recovery markers and 0 unknown failed tails. There were 0 scheduled blackout waits and 0.000 known seconds between attempts of the same stage. The scorer made 0 tablebase network calls and 0 retries. Stored-probe seconds measure local use of the inherited evidence.

Within the driver run, the power log records 0 Sleep, 0 DarkWake and 0 Wake events. Known sleep intervals overlap the run by 0.000 seconds. Events outside the run are used only to establish boundary state; their timeline is not published. Sleep ends at the first DarkWake or Wake, so a maintenance wake is not counted as sleep.

The capture has 281 battery/lid snapshots inside the run plus enclosing boundary snapshots. The boundary battery readings are 100% and 52%; the lowest observed reading is 52%. There are 0 closed-lid observations. These samples do not establish the state at every instant.

The observed change from AC Power to Battery Power falls between 159.298 and 160.300 minutes after driver start, a 60.107-second bracket. The later operator observation is not the disconnect time.

The wrapper requested both system-sleep and idle-system-sleep assertions with `caffeinate -s -i`, and kept the assertion process running through driver completion. The initial sampled system-wide flags were 1 and 1, respectively. At the AC-loss observation they were 0 and 1. A requested assertion is not the same as an effective system-wide flag. Other processes may also contribute to those flags; no continuous effectiveness is inferred.

A separate battery guard was deployed 164.515 minutes after driver start. It checked every 30 seconds and would request SIGTERM at 30% or below on battery. It logged 0 stop requests, 0 with later signal evidence, and 0 without delivery evidence. Its normal-exit message was present; 0 log lines were unclassified. A request is written before sending the signal, so a logged request alone would not prove delivery. The guard did not cover the earlier part of the run.

The supplement's separate `operations-manifest.json` binds these sources, the original freeze, completed reports, metadata, journal byte hashes and private operational evidence. It does not replace the measurement freeze. To reproduce from the lab root:

```bash
.venv/bin/python projects/rules-after-check/test_operations.py
nice -n 10 .venv/bin/python projects/rules-after-check/operations.py
```

The first generation used `--write-manifest`. Subsequent generation verifies the existing supplement manifest. No study row is parsed and no chess measure is recomputed.
