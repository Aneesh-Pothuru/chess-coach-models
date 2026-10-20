# Preserved suspension diagnosis

Written by `suspension-diagnostic.mjs`. App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; records `aed714ada579782ce73630596e59c8b65e74cb30`; cases SHA256 `ba26913e6c35403b132b614029216ff6209f6231c83a0fb8381140fcc9250ed6`. No new search or deciding metric ran.

Classification: does not qualify. A suspension is documented and the differing rows are downstream of the recorded adaptive-evidence selection. Deadline termination of that search is not proved.

There are 1 differing position rows and 1 differing record rows, with identical row sets. Only retained deep evidence differs within the positions. The replay's final deep evidence equals its raw verification event at every changed row. That reading equals the canonical history's initial reading; the canonical document retains the adaptive reading. No later teaching call visits the changed position, and extensions are unchanged. The record changes consume this evidence through the app's record rebuild. The side-summary changes are derived from those records. No unexplained final field remains in this dependency account.

The raw replay has 34/34 complete retained looks. 33/34 latest canonical verification readings match; 1 differ. The trace records 0 failed calls. These are retained-event facts; they do not establish completeness of a discarded adaptive result.

The captured power log records a full Sleep event at 2026-10-20T12:36:06.000Z and a Wake event at 2026-10-20T16:43:49.000Z, 14863.000 seconds apart. The adaptive call wrapper starts at 2026-10-20T12:36:09.231Z, 3.231 seconds after the logged Sleep event, and ends at 2026-10-20T16:43:49.132Z. It records 14859.764 Node elapsed seconds and 14859.901 UTC seconds.

The blocked replay's driver interval is 15087.344513 UTC seconds against 248.001385 Python monotonic seconds, a divergence of 14839.343128 seconds. The review itself records 15086.073955 Node performance seconds against 15086.221000 UTC seconds. The Node and Python elapsed clocks therefore differ in this record; the review duration is not the driver's shorter elapsed duration.

The pinned Node service supplies a 120000-millisecond deadline unless overridden. The observation wrapper supplied no override. The UCI session arms its timer inside the scheduled search slot. One terminal path receives bestmove and records timedOut=false. The other runs deadline recovery, drains the search and records timedOut=true. Search completion and CandidateSet partial carry that distinction; a deadline need not throw.

Adding the configured delay to the wrapper's call-start timestamp gives 2026-10-20T12:38:09.231Z, within the logged Sleep/Wake interval. This is nominal arithmetic only. It is not a measured slot-start timestamp, an observed timer expiry or a recorded deadline delivery. Service awaits and queueing precede timer arming. The preserved trace cannot establish when the timer armed, whether it elapsed during suspension, or which terminal callback won.

The call proxy retained depth, failure status and wrapper timings. It did not retain completion, timedOut, partial, returned node/time counters or the returned adaptive payload. The process log has 0 raw UCI lines and 0 terminal-path markers. The Node transport does not tee UCI stdout to a file and discards engine stderr; this replay disabled the evaluation cache. There is no retained direct terminal-path observation.

The returned adaptive depth is below the initial retained depth. In the pinned strongerEvidence source, a lower evidence rank keeps the prior reading; equal rank with lower depth also keeps it. This accounts for retention without identifying which rejection condition ran. It does not prove deadline termination. The conditional classification remains false.

Second stopped manifest SHA256 `d14ff24ed7eee03eb50a3268e1f1b90cfcbad51235bc0b4ad3892fb14c7371db`; second report SHA256 `626faf9d5b83896b63492bf734bf6ba08913e6a65ea935ef4ea826f9f1ffe5c6`; power log SHA256 `5901cb3f61d5d2936893688c6222497168e6c75a8dfe26af57a147623db775b3`; capture metadata SHA256 `fee8d1a96d34ea3f30abb31c05787465d2f73dedc72e70e5ec5594df86c5d654`; source-set SHA256 `1c663fec51a7bcc90a8e375eb55148b7d281d8211a80d59902bf87a96ac35b0a`; diagnostic script SHA256 `a905c04a76cb75a5ff4d5ee42cd97e3e3dcb66abdafb4ba4bf6c70da4f85e634`. Exact row and call locations remain private.
