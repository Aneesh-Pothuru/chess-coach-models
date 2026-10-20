# Maia player offsets: execution and recovery

Written by recover-review-timeouts.mjs. App f4bd63f19b343f686fb97ea4cf70b211c0bddc0a; records aed714ada579782ce73630596e59c8b65e74cb30. Protocol manifest SHA-256 02c9bfe673f63c64ca90985b982b4f047cb628a12a1c9f6a07c227c198fc8c5a; frozen protocol SHA-256 03433885daa5fc45e1bde0ae6fd3bf4dc632e267bb73840ea1bc0d9c0ff3607f.

Status: complete. Reviewed timeout-only restarts: 1. Completed review documents: 324 of 324; 322 newly completed and 2 retained from the benchmark. Timing records: 324; completed documents awaiting timing recovery: 0.

| Measure | Seconds |
|---|---:|
| Newly completed review worker time | 97452.73 |
| Completed review worker time including retained reviews | 97641.37 |
| Failed timeout wall time (17 failures) | 77297.63 |
| Recorded review stage wall time | 87592.54 |

Successful review worker seconds retain one latest timing per completed selected document, with the original reused reviews separated. Completed ply totals include only documents with timing. Ordinary timings run from spawn to child close; recovered timings run from the journaled start to the document modification time and omit later disposal. A worker can write a valid document before timing out, so its recovered completed-document interval can overlap a timeout interval. Timeout wall seconds sum failed child durations only for the individually verified timeout-only attempts shown here. Concurrent workers also overlap. These worker durations must not be added to infer stage wall time. Stage and session wall times count their elapsed intervals once and may include scheduling delays or machine suspension. None of these measures is CPU-active time. Untimed or unfinished attempts are not assigned invented durations. Historical errors, attempts, sessions and successful documents are retained. The AC watcher record hash establishes only that an operational record exists.
