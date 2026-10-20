# Lesson defenses beside the verdict

Written by defenses.mts. App commit 3a377486e8ae214f86f1e948f69231248f79f8a0; existing routine reviews at f4bd63f19b343f686fb97ea4cf70b211c0bddc0a; records commit aed714ada579782ce73630596e59c8b65e74cb30. Manifest SHA-256 98e238d3ed4aa5826f9c6ffbbb0eb941616b103b5f2fc80881552638adf0452a. This is a description, not an additional decision rule or a calibration test.

All 324 rebuilt held-out reviews are retained, with 2252 stored moments. The imported app pipeline requests a defense policy at 563 moments in 240 games; 563 have the opponent as defender and 0 have the player as defender. The converted band changes at 529 opponent-defender moments.

The app reads the position after the engine's better move, with the defender's band in both Maia inputs. It takes the modal move in the whole policy, preserving policy order on exact ties, and keeps it only if the app's board code calls it a move-away or block defense. It reports that move's probability rounded to three decimals. The port uses +400 only for an opponent defender; a player defender stays at +250.

| Group | Policy moments | Natural defense before | Natural defense after | Different moves, both present | Appears | Disappears | Any selection change, including absence |
|---|---:|---:|---:|---:|---:|---:|---:|
| All | 563 | 247 | 252 | 6 | 7 | 2 | 15 |
| Opponent defender | 563 | 247 | 252 | 6 | 7 | 2 | 15 |
| Player defender | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Changes in the app-reported probability are after minus before, in percentage points. Each pair uses its own selected defense, which may change. A missing defense is not assigned zero probability. Quartiles use sorted values at zero-based index round(q * (n - 1)).

| Group | Paired reported probes | Minimum | Lower quartile | Median | Upper quartile | Maximum signed change | Largest absolute change |
|---|---:|---:|---:|---:|---:|---:|---:|
| All | 245 | -8.30 | -0.30 | 1.00 | 3.50 | 14.30 | 14.30 |
| Opponent defender | 245 | -8.30 | -0.30 | 1.00 | 3.50 | 14.30 | 14.30 |
| Player defender | 0 | not applicable | not applicable | not applicable | not applicable | not applicable | not applicable |

Among opponent-defender pairs, 65 probabilities fall, 21 stay equal after app rounding, and 159 rise. 6 paired probes select different moves. The app emits 247 baseline and 252 port probes; 0 and 0 selected defenses respectively lack a usable continuation and therefore emit no probe.

There is no numerical probability threshold in the pinned defense selector or its lesson consumers. Threshold crossings are not applicable. Defense availability can change through the modal-move and board-classification gates, as counted above; it is not a probability-cutoff crossing. The consumers match the ply, better move and defense continuation, without using p as a cutoff.

Completed-game checkpoints contain 1092 app Node human-policy calls and 162 scoreMove calls at the imported routine budget, with at most two nice-10 workers. Discarded work from incomplete or interrupted games is excluded. Completed-game worker elapsed time sums to 236.12 seconds; concurrent worker times overlap and may include scheduling or suspension. Checkpoints resume by completed game. All per-game policies, selections and probes stay private.

The existing review selection and better moves are fixed. This does not rerun the review or measure lesson quality. These are counterfactual positions, so the game's next move is not an observed response to this defense position. The main study's verdict and punish guard are unchanged.
