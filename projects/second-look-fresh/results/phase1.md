# Fresh second looks: phase one

Written by phase1.mjs. App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; records `aed714ada579782ce73630596e59c8b65e74cb30`; candidate SHA-256 `8f1d16bc8d412dd2f9584c6eec3aea82ac3eefa22d15aed9be4ff6b05f0e89e1`.

Data: accuracy-vs-chesscom frozen cases, both players, original order; cases SHA-256 `ba26913e6c35403b132b614029216ff6209f6231c83a0fb8381140fcc9250ed6`. Engine: stockfish@18.0.8/stockfish-18-lite-single/nn-9067e33176e8; 1 thread, 128 MB hash, no evaluation cache.

All 60 games replay: 3917 plies, 3977 positions, 3939 nonterminal positions, 209 positions within the app's tablebase piece limit. Lengths: 12 short, 33 medium, 15 long; 27 to 163 plies.

Time controls: 59 at {"base":600,"inc":0}; 1 at {"base":900,"inc":10}. The frozen sample is retained without filtering.

Timing slice: the first frozen game, 53 plies. Devices ran two at a time; each routine ran alone. These are descriptive counts and timings, not a comparison under the rule.

| Arm | Profile | Review seconds | Looks | Adaptive calls | Second-look seconds | Seconds/look mean (median, p90) | Depth mean (median, p90) |
|---|---|---|---|---|---|---|---|
| baseline | phone | 17.21 | 14 | 4 | 13.54 | 0.97 (0.69, 1.69) | 17.36 (17.50, 18.70) |
| baseline | desktop | 24.99 | 14 | 4 | 16.30 | 1.16 (0.85, 2.77) | 17.36 (17.50, 19.00) |
| baseline | routine | 58.68 | 27 | 5 | 26.20 | 0.97 (0.59, 2.63) | 18.56 (17.00, 19.00) |
| candidate | phone | 17.71 | 14 | 4 | 14.05 | 1.00 (0.76, 1.80) | 16.86 (17.00, 18.00) |
| candidate | desktop | 25.71 | 14 | 4 | 17.01 | 1.21 (0.86, 2.82) | 16.71 (16.50, 18.70) |
| candidate | routine | 59.33 | 27 | 5 | 26.07 | 0.97 (0.48, 2.61) | 18.11 (16.00, 19.00) |

Reference timing: 2 fresh 7500000-node positions in 14.62 search seconds, 7.45 seconds each including resets. Mean depth 23.50. No reference verdict or agreement was read.

Determinism: 8 of 8 raw evidence comparisons identical, across 2 positions, 2 budgets and 3 profiles (12 searches). Gate passed: true.

The slice has 32 unique common attempted plies across profiles (phone: 14, desktop: 14, routine: 27). The full common sets require phase two; these are not whole-sample counts.

Full run: 360 CLI documents and 360 instrumented replays, plus about 2365 unique reference plies (3917 at most). Initial-look quota ceilings: phone: 1000, desktop: 1000, routine: 3917.

Estimated process work: 13.26 hours. With at most two workers, and routine alone: 3.30 hours for CLI documents, 3.30 hours for observed replays and 2.45 hours for references; 9.05 hours total. Reserving fifty percent for slowdown gives 13.58 hours.

If every ply needed a reference and every reference needed its retry, the same measured rate gives 14.71 hours total. This is a work envelope, not a runtime bound. The slice does not measure full-run tablebase/network stalls, all teaching costs, warm-model loading differences or thermal slowdown.

No deciding measure was computed. No packages were installed. Per-game documents and traces, including app runtime caches, are under private/second-look-fresh. The app pin and shared scripts were not changed. No TeX or PDF build was run.
