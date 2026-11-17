# Where each bucket's next sets would aim

Written by climb.mjs. App commit d18d5d2e53d1903e13aa2622d7815232aff7d451, its profile (synced 2026-11-13) read with that commit's own learner: the profile round 2 read, and no attempt after it. Nothing here is by a puzzle's depth.

For each bucket: the first tries its own sets have on record and how many days before the sync the last of them was played, the last set by itself (its last 12 first tries, once it has 6: how many he solved, their median rating, and the rating they give alone), the view the app aims from, and then where the next four sets would aim if he solved each in full, 14 days apart: aimed as the app aims, and aimed from the climb (the higher of the view and the last set's own rating). A set here is 12 first tries at the difficulty it aims at; an aim never passes 100 points over the hardest puzzle the bank holds for the bucket.

| Bucket | First tries on record | The last, days before the sync | Last set: solved | at about | Its own rating | The view | The app: next set, then after each perfect set | The climb: the same | Hardest in the bank |
|---|---:|---:|---:|---:|---:|---:|---|---|---:|
| hangingPiece | 52 | 3 | 10 of 12 | 1434 | 1658 | 1627 ± 63 | 1434 → 1488 → 1542 → 1593 | 1465 → 1723 → 1981 → 1999 | 1899 |
| op:caroKann | 36 | 29 | 9 of 12 | 1301 | 1412 | 1375 ± 73 | 1182 → 1249 → 1309 → 1367 | 1219 → 1477 → 1586 → 1586 | 1486 |
| fork | 36 | 0 | 9 of 12 | 1188 | 1346 | 1401 ± 77 | 1208 → 1288 → 1363 → 1428 | 1208 → 1466 → 1724 → 1982 | 1897 |
| planning | 37 | 4 | 12 of 12 | 915 | 1379 | 1222 ± 78 | 1029 → 1110 → 1195 → 1275 | 1186 → 1444 → 1702 → 1960 | 1878 |
| defensiveMove | 9 | 9 | 7 of 9 | 818 | 1006 | 1022 ± 129 | 829 → 965 → 1059 → 1143 | 829 → 1087 → 1345 → 1603 | 1898 |
| mateIn1 | 50 | 4 | 8 of 12 | 1659 | 1757 | 1821 ± 72 | 1628 → 1701 → 1767 → 1835 | 1628 → 1886 → 1996 → 1996 | 1896 |
| op:london | 12 | 3 | 9 of 12 | 1449 | 1561 | 1564 ± 103 | 1371 → 1471 → 1556 → 1594 | 1371 → 1594 → 1594 → 1594 | 1494 |
| queenEndgame | 9 | 2 | 5 of 9 | 1283 | 1289 | 1290 ± 116 | 1097 → 1215 → 1303 → 1375 | 1097 → 1355 → 1613 → 1871 | 1888 |
| discoveredAttack | 12 | 25 | 11 of 12 | 1248 | 1564 | 1547 ± 116 | 1354 → 1500 → 1594 → 1717 | 1371 → 1629 → 1887 → 1999 | 1899 |
| promotion | 12 | 5 | 11 of 12 | 1184 | 1518 | 1498 ± 111 | 1305 → 1449 → 1541 → 1663 | 1325 → 1583 → 1841 → 1999 | 1899 |
| backRankMate | 12 | 0 | 11 of 12 | 1194 | 1511 | 1498 ± 113 | 1305 → 1444 → 1535 → 1651 | 1318 → 1576 → 1834 → 1993 | 1893 |
| pawnEndgame | 3 | 25 | n/a | n/a | n/a | 1317 ± 180 | 1124 → 1299 → 1418 → 1515 | 1124 → 1382 → 1640 → 1898 | 1887 |
| mateIn2 | 12 | 46 | 12 of 12 | 710 | 1152 | 1083 ± 121 | 890 → 1075 → 1180 → 1355 | 959 → 1217 → 1475 → 1733 | 1897 |
| mateIn3 | 2 | 71 | n/a | n/a | n/a | 1084 ± 214 | 891 → 1085 → 1216 → 1308 | 891 → 1149 → 1407 → 1665 | 1899 |
| attackingF2F7 | 0 | n/a | n/a | n/a | n/a | none (totals) | 1156 → 1338 → 1520 → 1622 | 1156 → 1414 → 1672 → 1930 | 1889 |

The app's step after one perfect set, over the 15 buckets where the bank's ceiling does not cut it short: 54 points at the least, 136 at the median and 194 at the most.

An aim moves only when the bucket gets a set. The last first try of a bucket's own sets was 0 to 71 days before the sync, 4.5 at the median of the 14 buckets that have one, and more than 30 days before it in 2 of them.

Kept to a bucket whose record holds no missed first try, the climb changes the path of mateIn2 (12 first tries on record: 959 → 1217 → 1475 → 1733), attackingF2F7 (0 first tries on record: 1156 → 1414 → 1672 → 1930), and of no other bucket.

The climb would aim the next set at least 100 points over the app's aim in planning; kept to perfect sets, in planning.

The app's skill map calls 8 of these buckets stalled (fork, planning, mateIn1, discoveredAttack, promotion, backRankMate, mateIn2, attackingF2F7): by its rule he solves at least 95% of a stalled bucket's attempts, or more than 85% with its next set due at least 100 points over the last. The other 7: hangingPiece (holding), op:caroKann (holding), defensiveMove (holding), op:london (holding), queenEndgame (holding), pawnEndgame (holding), mateIn3 (holding).

The bank holds 6 more buckets, with no attempt on record: pin, skewer, trappedPiece, rookEndgame, op:kingsIndian, advancedPawn. No estimate aims a first set there: the app starts it from his level, at 1199, where the 15 buckets above aim their next sets from 829 to 1628, 1182 at the median.
