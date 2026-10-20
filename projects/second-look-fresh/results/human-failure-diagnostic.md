# Preserved human-policy failure diagnosis

Written by `generate-human-failure-diagnostic.mjs`. No new search or chess judgment ran. App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; records `aed714ada579782ce73630596e59c8b65e74cb30`; cases SHA256 `ba26913e6c35403b132b614029216ff6209f6231c83a0fb8381140fcc9250ed6`.

Downstream classification: passes. all differing rows follow the human-policy fallback through changed teaching selection and subsequent teaching searches. Unique causality remains unproven.

The preserved mismatch has 4 differing position rows and 4 differing record rows. Its 35 observed second looks are complete, and all 35 latest canonical verification readings match. The reconstructed verification histories also match; 4 earlier stability labels were not retained by the app after teaching.

There is 1 teaching-target substitution after an equal shared prefix. 1 differing row received teaching only in the canonical document; 1 received it only in the replay; 2 are later shared teaching targets. 0 differing rows remain outside this explanation.

The trace has 0 failed engine calls and 2 failed human-policy calls. 1 failure precedes teaching. The source catches it and disables the punishment-odds callback used to select teaching targets. 1 failure follows teaching, in defense probing after the core document is built. That later failure cannot cause its differing rows. Exception text was not retained.

The replay lies between 2026-10-20T10:29:15.881803+00:00 and 2026-10-20T10:33:10.102064+00:00. That window is 234.221 calendar seconds and 234.219 monotonic seconds; the review itself records 234.115 seconds. Individual call UTC timestamps were not recorded. The failed human-policy durations, in call order, are 0.086680 seconds (before teaching) and 0.041598 seconds (after teaching).

The original first replay and canonical document remain unchanged under stopped checkpoint SHA256 `80627e461645b670f18b38cce57f78f5d956deb7d360b2167cb20f920796b931`. Classifier SHA256 `aeecc796086692c13fde1f593e4df44553300259f23a06eaa3ac809cfa90cd5f`; generator SHA256 `720c09c911f4ec89f43a16022b76a70ed96971ae991a10aeb5d73ebcf5e47a05`; source-set SHA256 `2aa7e8b98ddf0df747120f2ae87cf56bfe8d79404850a73052ccbcf32075bc1a`. Exact row locations remain private.
