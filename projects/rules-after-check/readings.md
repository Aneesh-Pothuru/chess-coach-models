# Readings before the first position

This is the implementation for review. No study position has been read for
this question. The tests use invented rows and hand-made boards. The cost
report reads the previous run's published aggregate timings. The input
freeze hashes private files as bytes; it does not parse their rows.

The README remains the rule. These readings need the owner's confirmation
before the run. They do not add a verdict or a failure condition to it.

| Place where a choice was needed | Reading used in the scripts |
|---|---|
| The stated train and held-out position counts | Use every actually retained row for the thirteen rules. Some rules did not fill their original cap. Do not top up, redraw or manufacture rows. |
| Nonquiet positions | Score every row with a nonempty SR, including nonquiet rows, to supply the explicit description over all positions. Only quiet rows enter the control and verdicts. This follows the description section rather than the later cost paragraph's “once per quiet position.” It may cost more. |
| Empty SR | Keep the board row for coverage. Give Rs, Ns and R0s no value and make no Maia or referee call. Exclude the row from every move comparison, including Ns minus N. |
| Shared resamples | Within a rule and period, draw games from all its retained rows, then apply each measure's mask to those same game weights. Coverage, primary, all-position and split measures therefore share resamples. |
| Pooled control | Draw from the union of retained games across the thirteen rules, with one weight for every row from a game. Average paired row differences, rather than giving each rule an equal weight. Apply the quiet, failed-R, nonempty-SR mask after drawing. |
| Coverage denominators | Quiet divided by all retained rows; nonempty SR among quiet divided by quiet rows; Rs=R and Ns=N among the eligible comparison rows. For the all-position description, identities use all nonempty-SR rows, and safe-rule coverage also uses all retained rows. |
| Empty or failed control | An undefined interval cannot be above zero. A failed or undefined control withholds every verdict before the held-out count gate. Descriptions are still written. |
| Conditional and split estimates | The conditional lift is Rs minus Ns restricted to Rs differing from Ns. A split reports that cell's primary lift, without a cell-versus-rest test or another decision. |
| Reused soundness | Matching R, N, A and null R0 labels must all agree. Store the first matching label in that order to locate the evidence. False is a valid reused judgment. At seven men or fewer the stored tablebase probe takes precedence and is checked against all four labels. |
| Referee order | For a row needing new readings, clear the engine once, search one best line, then score each distinct new move in Rs, Ns, R0s order. The referee best is its first exact line, as in the null addition, rather than an incidental raw best-move field. |
| Fresh-best share | Count positions with any new referee search, not the number of newly scored moves. Compare that first exact best line with the original row's first exact best line. Report the primary and all-position denominators. |
| Example seed and supply | Keep candidates in the original positions-file order, as the predecessor did, and use the original sampler with the rule id, a NUL, and `after-check`. A rule with a verdict but fewer than eight eligible examples stops example generation; it does not shrink the sample or substitute another population. A failed control produces no examples. |
| Example evidence | Show the fresh best if this run searched any new move in the row; otherwise show the original best. A reused move keeps its original reading and benchmark, including the null's own reading for a reused R0. Thus win% readings can come from different searches, as their provenance states. Soundness is never recomputed against a different best. |

The two apps are separate cached checkouts selected through the bridge's
`CHESS_DIR`. `app-pins.json` names both pins and the records pin. `checkout.py`
prepared only the second app's source. Its dependency lock is identical to
the measured app's lock, and it uses the existing installed dependency tree
through a symlink. Nothing was installed. The root bridge pin is unchanged.

The original phase-two and null manifests remain untouched. The predecessor's
`answer_check.py` checks its answer against `frozen-readme.md`; this project
does not swap that README or invoke the old run. The new `input-manifest.json`
hashes the original input inventory and the completed null journals and
metadata. `manifest.json` freezes that manifest, this README, the scripts,
the predecessor source and results, both app source trees, bridge files, and
the measured engine and Maia assets. It records no commit of this branch.

The board pass visits September, July and August before the scoring pass in
the same order. Both use two shards, alternating rows after excluding Lucena
and Philidor. All month and shard signatures bind their input and source
hashes. An interrupted final line can be removed only from an unfinished
output journal of this project. A completed journal is checked before any
repair, and all predecessor files are read-only.

The detached driver owns a lock and starts each stage in its own session,
with its output in a file. Heavy workers receive nice 10 once; each scorer
owns one engine. A restart refuses to overlap a surviving stage group or
project worker. It does not kill a process merely from a saved pid.
At 12:59:50 UTC the driver requests termination of its stage
group and allows up to three seconds before killing it. Completed rows stay
committed, and an unfinished row is retried after 15:30 UTC. The margin keeps
work clear of the routines. Workers also check the clock before instrument
calls. Scheduled stops resume automatically; other failures stop for review.
No new tablebase request is made in this study.

The run and every row-reading entry point require `--reviewed` and the
committed freeze. This phase does not pass that gate. The README's answer and
the paper wait for the owner's review of the future results.
