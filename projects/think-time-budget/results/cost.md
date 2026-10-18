# Run cost



Written by `cost.py`; app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; frozen input `aab77f5f1ebb53ad65c7`; data 2026-09, 2026-08.



Balanced bridge slice: 100 games, 20.64 worker-seconds; projects 140.8 minutes for 81,847 games with two processes.

The actual count build used 351.3 worker-minutes, or 175.6 ideal minutes with two processes. Both use nice priority; elapsed time can rise under contention and heat.

Recorded bridge worker processes used 228.0 worker-minutes including Node startup and imports. Their observed first-start to last-end spans, summed over the sequential months, were 114.3 minutes. These measured process spans are reported separately from ideal chunk-work divided by two; gaps between months and the bridge shell lookup before Node are excluded. Some summaries describe resumed invocations, so these spans omit their earlier process time and are not the full build's elapsed time.

Fixed danger fit and scoring: 157.6 seconds at one thread. Count matching: 3.04 seconds.

A count-only 4,000-draw player kernel took 0.90 seconds to allocate and 0.029 seconds per weighted two-column pass. No outcome or think column was read.

Phase two from the saved facts and nuisance scores is projected at 0.9–2.2 minutes for the effect pass and its descriptions. This is a count-arithmetic estimate, not a measured effect run.

Approximate total from scratch for the frozen source prefixes through phase two: 235.0–236.2 minutes under the ideal two-process schedule. This includes 36.4 minutes for the source prefixes (the first two simultaneous; later months sequential), 17.4 minutes for 43 logged cohort count passes, and 1.6 minutes for the final cohort export rerun outside that log. It adds bridge chunk work divided by two, the phase-one load, danger fit and count matching, and the phase-two range above. The two loads belong to separate count and effect passes; the phase-two grouping is counted only in its own range.

This total is a projection, not observed wall time. It excludes pauses, unmeasured startup, launch imbalance, an extra allowance for contention or heat, optional pilot builds and report generation. Only source/count/build timings and outcomes-free arithmetic were measured; no effect pass was run.

Full-month streaming, if ever needed, projects 77.3 minutes with two processes at the observed rates. The registered sample stops at the reported prefixes; full months are not required.



No engine or Maia search is needed: the app reads the supplied Lichess evaluations and board facts. No packages were installed.
