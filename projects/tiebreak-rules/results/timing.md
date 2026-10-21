# July timing before scoring

App `ffee8dbb166f77dcc75721b6cca28d37703f4515`. The first 300 July games in file order were scanned. The input is the existing rules-of-thumb stream, verified against its summary before any game was parsed. No new stream download was needed. Only board readings and Maia-2 ran; no move was scored, no tablebase was queried, and no rule measure or verdict was computed.

The slice has 20977 positions, 6683 entering the scan, 2585 in at least one unit's situation, and 2585 Maia calls. The draws retain 488 unit rows in 412 distinct game/ply positions. 0 games with their own initial position were skipped.

| Unit | Situation positions | Split positions | Games with a split | Kept | Follow first | Break first |
|---|---:|---:|---:|---:|---:|---:|
| tension | 474 | 210 | 119 | 119 | 39 | 80 |
| trades-ahead | 22 | 9 | 8 | 8 | 3 | 5 |
| trades-behind | 46 | 21 | 17 | 17 | 12 | 5 |
| bishop-for-knight | 510 | 146 | 96 | 96 | 50 | 46 |
| knight-for-bishop | 75 | 55 | 38 | 38 | 29 | 9 |
| bishop-colour | 1687 | 63 | 44 | 44 | 26 | 18 |
| trades-level | 642 | 295 | 157 | 157 | 57 | 100 |
| hang | 2474 | 11 | 9 | 9 | 8 | 1 |

| Step | Attempts | Stops | Scheduled pauses | Supervisor UTC seconds | Supervisor timer seconds | Summed worker seconds |
|---|---:|---:|---:|---:|---:|---:|
| scan | 2 | 1 | 0 | 35.813 | 35.813 | 60.262 |
| select | 1 | 0 | 0 | 1.259 | 1.259 | — |

| Scanner instrument | Recorded seconds |
|---|---:|
| replaySeconds | 0.076 |
| boardSeconds | 0.150 |
| entrySeconds | 0.484 |
| unitsSeconds | 0.428 |
| maiaSeconds | 58.600 |
| hangSeconds | 0.289 |
| splitSeconds | 0.068 |
| rowSeconds | 60.176 |

The scanner's worker timers imply 5.022 worker hours for 90000 games, scaling the July slice per game. They include model startup and completed-game work but exclude initial stream decoding and freeze checks. The completed slice records 0 stopped worker jobs.

Engine cost comes from the prior rules-after-check aggregate: 171666 best/move searches took 28843.721 recorded seconds, or 0.168022 seconds per search. The timer includes engine clearing. This is a prior app/run's timing, not a measurement of the new referee.

| Workload assumption | Engine worker hours | Total worker hours | Ideal elapsed hours at two workers | Larger step |
|---|---:|---:|---:|---|
| observedJulySharing | 6.525 | 11.547 | 5.774 | engine |
| noCrossUnitSharing | 7.729 | 12.751 | 6.375 | engine |

Each unit's monthly draw count is projected from the July games with a split and capped at 3,000. The first scenario retains the July ratio of grouped positions to unit rows; the second allows no saving from a position shared by units. Each projected position is priced at one best search and two move searches, even where a tablebase could replace them. These are workload scenarios, not runtime bounds: another month's situation rates, sharing and instrument speed can differ.

Tablebase network time is unmeasured. The ideal two-worker time assumes balanced workers and excludes selection/analysis, byte verification, startup differences, retry/restart delays and machine interruptions. Heavy work pauses at 12:59:50 UTC and resumes at 15:30; calendar duration therefore depends on the launch time. These elapsed timers are not CPU usage, and UTC and process timers can differ across suspension. A missing terminal event leaves that attempt's time unknown, with the known subtotal retained; a recovered worker's uncheckpointed failed tail is not reconstructed as zero.

No package or model was installed for this timing pass. The existing Maia asset is read through the new app's human model; model downloads are disabled. `timing-manifest.json` binds the frozen measurement sources, the completed timing metadata and journal byte hashes, the supervisor's completed-event prefix and these generated reports.
