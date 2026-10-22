# Tie-break rules: results

App `ffee8dbb166f77dcc75721b6cca28d37703f4515`. Lichess rated standard 600+0 games, CC0. July and August 2026 are pooled for train; September is held out.

Intervals use 2000 shared game resamples per period, seed 20261021. Every unit and control uses the union of retained games. Any undefined resample makes its interval undefined. Differences are percentage points; shares are percentages. Rules with two units average their unit estimates equally on every draw.

## The control

| Period | Positions | Follow first | Break first | Balanced lift |
|---|---:|---:|---:|---|
| train | 2436 | 1541 | 895 | 29.06 (26.26 to 31.83) |
| heldout | 1260 | 799 | 461 | 28.47 (24.37 to 32.44) |

Control: passes.

## The rules

| Rule | Train balanced lift | Held-out balanced lift | Verdict | Worth-switching criterion |
|---|---|---|---|---|
| tension | -0.35 (-2.19 to 1.48) | -1.55 (-4.13 to 1.10) | does no better than Maia-2's order | not met |
| trades-development | 4.50 (2.62 to 6.34) | 1.15 (-1.77 to 3.91) | does no better than Maia-2's order | not met |
| bishop-knight | 5.59 (4.28 to 6.92) | 4.02 (2.12 to 5.87) | breaks the tie | not met |
| bishop-colour | 3.38 (1.79 to 5.05) | 3.99 (1.69 to 6.14) | breaks the tie | not met |


## Measures

Units and the reference describe separately. Only a rule's balanced lift decides its verdict after the control and count gates. The break-first lift alone supplies the separate worth-switching criterion.

| Kind | Name | Period | Plain lift | Follow-first lift | Break-first lift | Balanced lift | F share when only one sound, balanced | F minus first choice |
|---|---|---|---|---|---|---|---|---|
| rules | tension | train | -5.72 (-7.51 to -3.92) | 14.23 (11.29 to 17.26) | -14.94 (-17.13 to -12.94) | -0.35 (-2.19 to 1.48) | 49.99 (48.12 to 51.87) | -10.22 (-11.69 to -8.83) |
| rules | tension | heldout | -7.17 (-9.59 to -4.72) | 14.06 (9.71 to 18.30) | -17.16 (-20.02 to -14.35) | -1.55 (-4.13 to 1.10) | 48.57 (46.01 to 51.22) | -11.67 (-13.65 to -9.70) |
| rules | trades-development | train | 2.76 (1.03 to 4.51) | 25.85 (22.87 to 28.63) | -16.85 (-19.21 to -14.48) | 4.50 (2.62 to 6.34) | 54.06 (52.45 to 55.65) | -9.25 (-10.66 to -7.92) |
| rules | trades-development | heldout | 1.80 (-0.79 to 4.27) | 18.38 (14.04 to 22.92) | -16.09 (-19.39 to -12.69) | 1.15 (-1.77 to 3.91) | 50.64 (48.08 to 53.05) | -8.18 (-10.05 to -6.27) |
| rules | bishop-knight | train | 11.34 (10.09 to 12.60) | 25.24 (23.66 to 26.78) | -14.06 (-16.16 to -11.92) | 5.59 (4.28 to 6.92) | 55.01 (53.77 to 56.29) | -4.40 (-5.15 to -3.65) |
| rules | bishop-knight | heldout | 10.13 (8.35 to 11.91) | 24.63 (22.39 to 26.76) | -16.60 (-19.64 to -13.47) | 4.02 (2.12 to 5.87) | 53.65 (51.98 to 55.35) | -5.25 (-6.28 to -4.17) |
| rules | bishop-colour | train | 3.77 (2.13 to 5.43) | 15.00 (12.86 to 17.32) | -8.24 (-10.56 to -5.94) | 3.38 (1.79 to 5.05) | 53.53 (51.67 to 55.41) | -3.98 (-5.11 to -2.88) |
| rules | bishop-colour | heldout | 4.00 (1.62 to 6.20) | 18.25 (15.03 to 21.51) | -10.27 (-13.42 to -7.05) | 3.99 (1.69 to 6.14) | 54.19 (51.59 to 56.77) | -5.13 (-6.75 to -3.53) |
| units | tension | train | -5.72 (-7.51 to -3.92) | 14.23 (11.29 to 17.26) | -14.94 (-17.13 to -12.94) | -0.35 (-2.19 to 1.48) | 49.99 (48.12 to 51.87) | -10.22 (-11.69 to -8.83) |
| units | tension | heldout | -7.17 (-9.59 to -4.72) | 14.06 (9.71 to 18.30) | -17.16 (-20.02 to -14.35) | -1.55 (-4.13 to 1.10) | 48.57 (46.01 to 51.22) | -11.67 (-13.65 to -9.70) |
| units | trades-ahead | train | -5.85 (-8.89 to -2.96) | 26.30 (21.06 to 31.35) | -18.42 (-21.69 to -15.03) | 3.94 (0.78 to 6.93) | 53.49 (50.74 to 56.12) | -13.24 (-15.65 to -10.78) |
| units | trades-ahead | heldout | -7.11 (-11.43 to -2.96) | 10.94 (2.89 to 19.41) | -13.96 (-18.56 to -9.07) | -1.51 (-6.39 to 3.14) | 48.40 (44.19 to 52.40) | -10.12 (-13.44 to -6.61) |
| units | trades-behind | train | 11.38 (9.37 to 13.39) | 25.39 (22.98 to 27.72) | -15.29 (-18.74 to -11.81) | 5.05 (3.01 to 7.01) | 54.62 (52.77 to 56.42) | -5.27 (-6.47 to -4.06) |
| units | trades-behind | heldout | 10.70 (7.88 to 13.66) | 25.81 (22.45 to 29.10) | -18.22 (-23.03 to -13.55) | 3.80 (0.96 to 6.62) | 52.87 (50.38 to 55.47) | -6.25 (-7.92 to -4.64) |
| units | bishop-for-knight | train | 9.50 (7.69 to 11.23) | 28.41 (25.90 to 30.76) | -9.49 (-12.04 to -6.98) | 9.46 (7.70 to 11.14) | 58.63 (57.06 to 60.20) | -4.73 (-6.01 to -3.48) |
| units | bishop-for-knight | heldout | 8.37 (5.89 to 10.96) | 27.08 (23.61 to 30.52) | -10.80 (-14.25 to -7.12) | 8.14 (5.78 to 10.74) | 57.24 (55.02 to 59.54) | -5.33 (-7.07 to -3.52) |
| units | knight-for-bishop | train | 13.18 (11.35 to 14.96) | 22.07 (20.04 to 23.97) | -18.63 (-22.22 to -15.20) | 1.72 (-0.35 to 3.79) | 51.39 (49.44 to 53.28) | -4.07 (-4.88 to -3.28) |
| units | knight-for-bishop | heldout | 11.90 (9.24 to 14.48) | 22.18 (19.25 to 24.96) | -22.40 (-27.65 to -17.28) | -0.11 (-3.10 to 2.90) | 50.07 (47.45 to 52.65) | -5.17 (-6.41 to -3.95) |
| units | bishop-colour | train | 3.77 (2.13 to 5.43) | 15.00 (12.86 to 17.32) | -8.24 (-10.56 to -5.94) | 3.38 (1.79 to 5.05) | 53.53 (51.67 to 55.41) | -3.98 (-5.11 to -2.88) |
| units | bishop-colour | heldout | 4.00 (1.62 to 6.20) | 18.25 (15.03 to 21.51) | -10.27 (-13.42 to -7.05) | 3.99 (1.69 to 6.14) | 54.19 (51.59 to 56.77) | -5.13 (-6.75 to -3.53) |
| units | trades-level | train | -6.28 (-8.11 to -4.56) | 22.36 (19.34 to 25.28) | -20.98 (-23.25 to -18.88) | 0.69 (-1.14 to 2.46) | 51.41 (49.79 to 52.98) | -13.87 (-15.40 to -12.48) |
| units | trades-level | heldout | -7.70 (-10.27 to -5.10) | 19.17 (15.03 to 23.42) | -21.38 (-24.58 to -18.30) | -1.10 (-3.73 to 1.54) | 49.43 (47.03 to 51.81) | -14.17 (-16.34 to -12.10) |
| units | hang | train | 32.27 (29.61 to 34.98) | 41.14 (37.80 to 44.23) | 16.98 (12.43 to 21.33) | 29.06 (26.26 to 31.83) | 75.88 (73.39 to 78.16) | 6.24 (4.52 to 7.92) |
| units | hang | heldout | 31.75 (27.76 to 35.38) | 40.68 (36.03 to 45.04) | 16.27 (9.54 to 22.86) | 28.47 (24.37 to 32.44) | 75.00 (71.43 to 78.37) | 5.95 (3.51 to 8.40) |

## Coverage

| Unit | Month | In situation | Splits | Games with split | Kept | Follow first | Break first |
|---|---|---:|---:|---:|---:|---:|---:|
| tension | 2026-07 | 50214 | 22363 | 12440 | 3000 | 945 | 2055 |
| trades-ahead | 2026-07 | 3376 | 1463 | 1208 | 1208 | 338 | 870 |
| trades-behind | 2026-07 | 6704 | 2962 | 2431 | 2431 | 1582 | 849 |
| bishop-for-knight | 2026-07 | 48852 | 13917 | 9469 | 3000 | 1497 | 1503 |
| knight-for-bishop | 2026-07 | 8583 | 6076 | 4487 | 3000 | 2329 | 671 |
| bishop-colour | 2026-07 | 189586 | 7688 | 5417 | 3000 | 1561 | 1439 |
| trades-level | 2026-07 | 59875 | 28565 | 14700 | 3000 | 994 | 2006 |
| hang | 2026-07 | 267353 | 1403 | 1228 | 1228 | 786 | 442 |
| tension | 2026-08 | 50039 | 22415 | 12403 | 3000 | 952 | 2048 |
| trades-ahead | 2026-08 | 3474 | 1535 | 1254 | 1254 | 354 | 900 |
| trades-behind | 2026-08 | 6924 | 2990 | 2448 | 2448 | 1616 | 832 |
| bishop-for-knight | 2026-08 | 48216 | 13594 | 9226 | 3000 | 1509 | 1491 |
| knight-for-bishop | 2026-08 | 8538 | 6060 | 4439 | 3000 | 2361 | 639 |
| bishop-colour | 2026-08 | 189206 | 7654 | 5353 | 3000 | 1539 | 1461 |
| trades-level | 2026-08 | 58592 | 27930 | 14472 | 3000 | 1041 | 1959 |
| hang | 2026-08 | 266285 | 1383 | 1208 | 1208 | 755 | 453 |
| tension | 2026-09 | 49779 | 22180 | 12315 | 3000 | 960 | 2040 |
| trades-ahead | 2026-09 | 3359 | 1454 | 1196 | 1196 | 329 | 867 |
| trades-behind | 2026-09 | 6651 | 2888 | 2383 | 2383 | 1565 | 818 |
| bishop-for-knight | 2026-09 | 48681 | 13805 | 9315 | 3000 | 1518 | 1482 |
| knight-for-bishop | 2026-09 | 8975 | 6306 | 4629 | 3000 | 2308 | 692 |
| bishop-colour | 2026-09 | 189254 | 7644 | 5396 | 3000 | 1501 | 1499 |
| trades-level | 2026-09 | 60057 | 28609 | 14707 | 3000 | 1012 | 1988 |
| hang | 2026-09 | 267036 | 1442 | 1260 | 1260 | 799 | 461 |

## Unit descriptions

| Unit | Period | Descriptive verdict | P(F) | P(B) | Played F / B / other, follow first | Played F / B / other, break first |
|---|---|---|---|---|---|---|
| tension | train | does no better than Maia-2's order | 25.06 (24.67 to 25.45) | 39.84 (39.34 to 40.32) | 36.22 (34.12 to 38.37) / 29.52 (27.51 to 31.55) / 34.26 (32.20 to 36.39) | 15.21 (14.15 to 16.31) / 51.26 (49.68 to 52.74) / 33.54 (32.19 to 34.99) |
| tension | heldout | does no better than Maia-2's order | 25.12 (24.59 to 25.65) | 39.43 (38.73 to 40.10) | 36.04 (32.93 to 39.06) / 28.75 (25.88 to 31.65) / 35.21 (32.27 to 38.22) | 14.90 (13.40 to 16.46) / 54.26 (52.11 to 56.38) / 30.83 (28.83 to 32.81) |
| trades-ahead | train | does no better than Maia-2's order | 23.21 (22.64 to 23.77) | 40.94 (40.21 to 41.71) | 34.25 (30.66 to 37.63) / 28.32 (25.11 to 31.56) / 37.43 (33.98 to 41.03) | 15.99 (14.35 to 17.70) / 49.89 (47.57 to 52.14) / 34.12 (31.99 to 36.36) |
| trades-ahead | heldout | does no better than Maia-2's order | 23.49 (22.79 to 24.21) | 40.29 (39.24 to 41.35) | 34.35 (29.13 to 39.40) / 24.32 (19.71 to 28.71) / 41.34 (36.07 to 46.63) | 17.88 (15.43 to 20.62) / 47.87 (44.51 to 51.03) / 34.26 (31.29 to 37.40) |
| trades-behind | train | breaks the tie | 38.39 (37.87 to 38.93) | 25.22 (24.82 to 25.63) | 49.59 (47.88 to 51.19) / 16.92 (15.64 to 18.25) / 33.49 (31.96 to 35.07) | 25.40 (23.33 to 27.42) / 38.25 (35.88 to 40.64) / 36.35 (34.09 to 38.58) |
| trades-behind | heldout | breaks the tie | 38.77 (37.97 to 39.54) | 25.45 (24.86 to 26.07) | 48.75 (46.37 to 51.22) / 16.81 (14.97 to 18.63) / 34.44 (32.06 to 36.74) | 23.11 (20.22 to 26.02) / 39.73 (36.33 to 43.28) / 37.16 (33.95 to 40.71) |
| bishop-for-knight | train | breaks the tie | 29.63 (29.23 to 30.02) | 29.81 (29.43 to 30.20) | 37.19 (35.46 to 38.96) / 22.39 (20.89 to 23.88) / 40.42 (38.56 to 42.18) | 18.64 (17.35 to 20.03) / 43.62 (41.76 to 45.43) / 37.74 (35.99 to 39.49) |
| bishop-for-knight | heldout | breaks the tie | 29.49 (28.93 to 30.06) | 29.77 (29.22 to 30.39) | 39.13 (36.74 to 41.51) / 23.58 (21.52 to 25.86) / 37.29 (34.85 to 39.70) | 17.00 (15.09 to 18.97) / 43.99 (41.53 to 46.50) / 39.00 (36.58 to 41.37) |
| knight-for-bishop | train | does no better than Maia-2's order | 46.27 (45.76 to 46.79) | 21.37 (21.04 to 21.72) | 55.93 (54.43 to 57.32) / 15.65 (14.61 to 16.70) / 28.42 (27.16 to 29.76) | 30.99 (28.56 to 33.43) / 34.27 (31.76 to 36.70) / 34.73 (32.07 to 37.33) |
| knight-for-bishop | heldout | does no better than Maia-2's order | 45.96 (45.26 to 46.72) | 21.94 (21.44 to 22.42) | 54.64 (52.70 to 56.65) / 16.64 (15.11 to 18.05) / 28.73 (26.91 to 30.56) | 28.47 (25.14 to 31.77) / 33.38 (29.70 to 36.88) / 38.15 (34.56 to 41.96) |
| bishop-colour | train | breaks the tie | 29.78 (29.39 to 30.21) | 29.19 (28.74 to 29.60) | 40.42 (38.77 to 42.14) / 19.58 (18.20 to 21.01) / 40.00 (38.33 to 41.70) | 18.76 (17.32 to 20.15) / 43.31 (41.50 to 45.13) / 37.93 (36.15 to 39.75) |
| bishop-colour | heldout | breaks the tie | 29.52 (28.93 to 30.15) | 30.18 (29.56 to 30.81) | 41.64 (39.03 to 44.06) / 20.32 (18.34 to 22.43) / 38.04 (35.61 to 40.48) | 17.41 (15.53 to 19.38) / 41.16 (38.74 to 43.68) / 41.43 (39.01 to 43.84) |
| trades-level | train | no rule verdict | 25.43 (25.04 to 25.81) | 39.04 (38.56 to 39.53) | 36.22 (34.06 to 38.29) / 25.85 (23.95 to 27.76) / 37.94 (35.77 to 40.08) | 16.75 (15.61 to 17.90) / 52.81 (51.21 to 54.29) / 30.44 (29.10 to 31.82) |
| trades-level | heldout | no rule verdict | 25.19 (24.66 to 25.71) | 39.41 (38.72 to 40.16) | 35.38 (32.54 to 38.38) / 28.26 (25.54 to 31.16) / 36.36 (33.46 to 39.27) | 16.10 (14.45 to 17.74) / 50.96 (48.73 to 53.17) / 32.95 (30.93 to 34.94) |
| hang | train | no rule verdict | 31.16 (30.48 to 31.84) | 22.20 (21.74 to 22.68) | 36.99 (34.66 to 39.51) / 15.57 (13.89 to 17.30) / 47.44 (44.94 to 49.83) | 20.56 (17.89 to 23.19) / 23.13 (20.41 to 25.94) / 56.31 (53.18 to 59.52) |
| hang | heldout | no rule verdict | 32.02 (31.02 to 33.03) | 21.56 (20.90 to 22.18) | 39.55 (36.14 to 42.84) / 15.89 (13.36 to 18.41) / 44.56 (41.16 to 47.97) | 21.26 (17.27 to 24.90) / 25.60 (21.75 to 29.73) / 53.15 (48.82 to 57.63) |

## Split descriptions

All registered measures, probabilities and move-played shares for every split cell and both bands are in `rules.json`, with their denominators and undefined-draw counts. The table below gives each cell's balanced lift; no split creates a verdict.

| Unit | Period | Split | Cell | Positions | Follow first | Break first | Balanced lift |
|---|---|---|---|---:|---:|---:|---|
| tension | train | close | false | 3263 | 731 | 2532 | -1.00 (-3.68 to 1.73) |
| tension | train | close | true | 2737 | 1166 | 1571 | 4.33 (1.83 to 6.95) |
| tension | train | band | 1300 | 2511 | 779 | 1732 | -0.37 (-3.22 to 2.54) |
| tension | train | band | 1500 | 3489 | 1118 | 2371 | -0.37 (-2.85 to 2.04) |
| tension | train | phase | opening | 2586 | 982 | 1604 | 0.28 (-2.41 to 3.04) |
| tension | train | phase | middlegame | 2578 | 745 | 1833 | 0.15 (-2.67 to 3.02) |
| tension | train | phase | endgame | 836 | 170 | 666 | -4.13 (-9.61 to 1.61) |
| tension | train | tensionCentral | false | 1222 | 302 | 920 | 0.34 (-3.80 to 4.96) |
| tension | train | tensionCentral | true | 4778 | 1595 | 3183 | -0.49 (-2.64 to 1.50) |
| tension | heldout | close | false | 1586 | 371 | 1215 | -2.54 (-6.32 to 1.21) |
| tension | heldout | close | true | 1414 | 589 | 825 | 3.19 (-0.38 to 6.80) |
| tension | heldout | band | 1300 | 1299 | 387 | 912 | -2.30 (-6.46 to 1.81) |
| tension | heldout | band | 1500 | 1701 | 573 | 1128 | -0.86 (-4.13 to 2.40) |
| tension | heldout | phase | opening | 1304 | 529 | 775 | -2.21 (-5.74 to 1.53) |
| tension | heldout | phase | middlegame | 1261 | 333 | 928 | -3.40 (-7.70 to 0.87) |
| tension | heldout | phase | endgame | 435 | 98 | 337 | 5.16 (-1.88 to 12.44) |
| tension | heldout | tensionCentral | false | 600 | 125 | 475 | -3.79 (-11.04 to 3.13) |
| tension | heldout | tensionCentral | true | 2400 | 835 | 1565 | -1.03 (-3.98 to 1.88) |
| trades-ahead | train | close | false | 1343 | 240 | 1103 | 7.27 (2.44 to 11.93) |
| trades-ahead | train | close | true | 1119 | 452 | 667 | 7.76 (3.56 to 12.05) |
| trades-ahead | train | band | 1300 | 1094 | 301 | 793 | 6.75 (1.97 to 11.23) |
| trades-ahead | train | band | 1500 | 1368 | 391 | 977 | 1.73 (-2.49 to 5.92) |
| trades-ahead | train | phase | opening | 1562 | 441 | 1121 | 3.84 (-0.07 to 7.50) |
| trades-ahead | train | phase | middlegame | 900 | 251 | 649 | 4.14 (-1.02 to 9.33) |
| trades-ahead | train | phase | endgame | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| trades-ahead | train | tradePiece | n | 1304 | 456 | 848 | 4.26 (-0.07 to 8.25) |
| trades-ahead | train | tradePiece | b | 973 | 208 | 765 | -3.49 (-8.86 to 1.96) |
| trades-ahead | train | tradePiece | r | 17 | 2 | 15 | 11.67 (interval undefined; 239 missing draws) |
| trades-ahead | train | tradePiece | q | 168 | 26 | 142 | 31.01 (16.83 to 44.46) |
| trades-ahead | heldout | close | false | 633 | 109 | 524 | 0.48 (-6.97 to 8.03) |
| trades-ahead | heldout | close | true | 563 | 220 | 343 | 2.13 (-4.35 to 8.15) |
| trades-ahead | heldout | band | 1300 | 538 | 125 | 413 | -0.73 (-7.90 to 6.69) |
| trades-ahead | heldout | band | 1500 | 658 | 204 | 454 | -2.29 (-8.78 to 3.79) |
| trades-ahead | heldout | phase | opening | 763 | 215 | 548 | -3.56 (-9.77 to 2.42) |
| trades-ahead | heldout | phase | middlegame | 433 | 114 | 319 | 2.16 (-5.84 to 9.85) |
| trades-ahead | heldout | phase | endgame | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| trades-ahead | heldout | tradePiece | n | 652 | 209 | 443 | -0.78 (-7.30 to 5.40) |
| trades-ahead | heldout | tradePiece | b | 449 | 105 | 344 | -8.35 (-15.83 to -0.83) |
| trades-ahead | heldout | tradePiece | r | 6 | 0 | 6 | undefined (interval undefined; 2000 missing draws) |
| trades-ahead | heldout | tradePiece | q | 89 | 15 | 74 | 14.86 (-6.21 to 35.60) |
| trades-behind | train | close | false | 2464 | 1862 | 602 | 6.95 (3.77 to 10.08) |
| trades-behind | train | close | true | 2415 | 1336 | 1079 | -1.69 (-4.45 to 1.09) |
| trades-behind | train | band | 1300 | 2275 | 1519 | 756 | 5.66 (2.65 to 8.89) |
| trades-behind | train | band | 1500 | 2604 | 1679 | 925 | 4.58 (1.75 to 7.25) |
| trades-behind | train | phase | opening | 3244 | 2112 | 1132 | 6.71 (4.17 to 9.19) |
| trades-behind | train | phase | middlegame | 1635 | 1086 | 549 | 1.72 (-2.08 to 5.37) |
| trades-behind | train | phase | endgame | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| trades-behind | train | tradePiece | n | 2646 | 1496 | 1150 | -5.28 (-8.04 to -2.64) |
| trades-behind | train | tradePiece | b | 1988 | 1507 | 481 | 20.12 (16.44 to 23.64) |
| trades-behind | train | tradePiece | r | 37 | 28 | 9 | 1.39 (-18.59 to 20.64) |
| trades-behind | train | tradePiece | q | 208 | 167 | 41 | 28.51 (16.56 to 39.72) |
| trades-behind | heldout | close | false | 1216 | 914 | 302 | 4.97 (0.44 to 9.34) |
| trades-behind | heldout | close | true | 1167 | 651 | 516 | -1.77 (-5.96 to 2.23) |
| trades-behind | heldout | band | 1300 | 1083 | 702 | 381 | -0.31 (-4.70 to 4.28) |
| trades-behind | heldout | band | 1500 | 1300 | 863 | 437 | 7.23 (3.35 to 11.15) |
| trades-behind | heldout | phase | opening | 1598 | 1053 | 545 | 2.28 (-1.10 to 5.88) |
| trades-behind | heldout | phase | middlegame | 785 | 512 | 273 | 6.82 (1.26 to 11.92) |
| trades-behind | heldout | phase | endgame | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| trades-behind | heldout | tradePiece | n | 1319 | 753 | 566 | -8.64 (-12.57 to -4.90) |
| trades-behind | heldout | tradePiece | b | 934 | 702 | 232 | 21.47 (16.52 to 26.49) |
| trades-behind | heldout | tradePiece | r | 18 | 16 | 2 | 31.25 (interval undefined; 289 missing draws) |
| trades-behind | heldout | tradePiece | q | 112 | 94 | 18 | 40.48 (25.60 to 54.90) |
| bishop-for-knight | train | close | false | 2602 | 1279 | 1323 | 5.58 (2.99 to 8.02) |
| bishop-for-knight | train | close | true | 3398 | 1727 | 1671 | 12.78 (10.40 to 14.99) |
| bishop-for-knight | train | band | 1300 | 2752 | 1362 | 1390 | 12.04 (9.44 to 14.56) |
| bishop-for-knight | train | band | 1500 | 3248 | 1644 | 1604 | 7.28 (4.76 to 9.73) |
| bishop-for-knight | train | phase | opening | 2700 | 1497 | 1203 | 13.93 (11.28 to 16.53) |
| bishop-for-knight | train | phase | middlegame | 3031 | 1402 | 1629 | 6.08 (3.65 to 8.61) |
| bishop-for-knight | train | phase | endgame | 269 | 107 | 162 | -1.03 (-9.86 to 6.76) |
| bishop-for-knight | train | tradePiece | n | 6000 | 3006 | 2994 | 9.46 (7.70 to 11.14) |
| bishop-for-knight | train | tradePiece | b | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| bishop-for-knight | train | tradePiece | r | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| bishop-for-knight | train | tradePiece | q | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| bishop-for-knight | heldout | close | false | 1327 | 643 | 684 | 7.21 (3.69 to 10.75) |
| bishop-for-knight | heldout | close | true | 1673 | 875 | 798 | 9.76 (6.44 to 13.14) |
| bishop-for-knight | heldout | band | 1300 | 1450 | 728 | 722 | 11.52 (8.17 to 15.17) |
| bishop-for-knight | heldout | band | 1500 | 1550 | 790 | 760 | 4.94 (1.36 to 8.46) |
| bishop-for-knight | heldout | phase | opening | 1354 | 738 | 616 | 10.17 (6.43 to 13.85) |
| bishop-for-knight | heldout | phase | middlegame | 1509 | 725 | 784 | 6.99 (3.58 to 10.43) |
| bishop-for-knight | heldout | phase | endgame | 137 | 55 | 82 | -3.07 (-14.97 to 9.58) |
| bishop-for-knight | heldout | tradePiece | n | 3000 | 1518 | 1482 | 8.14 (5.78 to 10.74) |
| bishop-for-knight | heldout | tradePiece | b | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| bishop-for-knight | heldout | tradePiece | r | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| bishop-for-knight | heldout | tradePiece | q | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| knight-for-bishop | train | close | false | 3679 | 3269 | 410 | -1.52 (-4.93 to 1.93) |
| knight-for-bishop | train | close | true | 2321 | 1421 | 900 | -3.56 (-6.47 to -0.70) |
| knight-for-bishop | train | band | 1300 | 2566 | 2029 | 537 | 2.59 (-0.82 to 5.91) |
| knight-for-bishop | train | band | 1500 | 3434 | 2661 | 773 | 1.12 (-1.62 to 3.80) |
| knight-for-bishop | train | phase | opening | 2053 | 1657 | 396 | 11.68 (7.65 to 15.60) |
| knight-for-bishop | train | phase | middlegame | 3487 | 2705 | 782 | -4.07 (-6.75 to -1.52) |
| knight-for-bishop | train | phase | endgame | 460 | 328 | 132 | 3.46 (-3.31 to 10.39) |
| knight-for-bishop | train | tradePiece | n | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| knight-for-bishop | train | tradePiece | b | 6000 | 4690 | 1310 | 1.72 (-0.35 to 3.79) |
| knight-for-bishop | train | tradePiece | r | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| knight-for-bishop | train | tradePiece | q | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| knight-for-bishop | heldout | close | false | 1781 | 1567 | 214 | -1.67 (-6.47 to 3.24) |
| knight-for-bishop | heldout | close | true | 1219 | 741 | 478 | -6.19 (-10.31 to -2.17) |
| knight-for-bishop | heldout | band | 1300 | 1275 | 976 | 299 | -2.14 (-6.78 to 2.45) |
| knight-for-bishop | heldout | band | 1500 | 1725 | 1332 | 393 | 1.42 (-2.34 to 5.24) |
| knight-for-bishop | heldout | phase | opening | 1061 | 879 | 182 | 8.48 (2.69 to 14.58) |
| knight-for-bishop | heldout | phase | middlegame | 1715 | 1276 | 439 | -4.43 (-8.18 to -0.63) |
| knight-for-bishop | heldout | phase | endgame | 224 | 153 | 71 | -6.14 (-14.62 to 2.06) |
| knight-for-bishop | heldout | tradePiece | n | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| knight-for-bishop | heldout | tradePiece | b | 3000 | 2308 | 692 | -0.11 (-3.10 to 2.90) |
| knight-for-bishop | heldout | tradePiece | r | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| knight-for-bishop | heldout | tradePiece | q | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| bishop-colour | train | close | false | 2552 | 1329 | 1223 | 3.97 (1.58 to 6.30) |
| bishop-colour | train | close | true | 3448 | 1771 | 1677 | 2.84 (0.61 to 4.89) |
| bishop-colour | train | band | 1300 | 2702 | 1392 | 1310 | 2.91 (0.49 to 5.50) |
| bishop-colour | train | band | 1500 | 3298 | 1708 | 1590 | 3.77 (1.60 to 5.97) |
| bishop-colour | train | phase | opening | 1147 | 593 | 554 | 1.19 (-2.81 to 5.10) |
| bishop-colour | train | phase | middlegame | 3436 | 1803 | 1633 | 3.89 (1.67 to 6.09) |
| bishop-colour | train | phase | endgame | 1417 | 704 | 713 | 3.72 (0.99 to 6.34) |
| bishop-colour | heldout | close | false | 1341 | 654 | 687 | 5.17 (1.87 to 8.51) |
| bishop-colour | heldout | close | true | 1659 | 847 | 812 | 3.44 (0.28 to 6.53) |
| bishop-colour | heldout | band | 1300 | 1364 | 664 | 700 | 3.57 (0.29 to 6.90) |
| bishop-colour | heldout | band | 1500 | 1636 | 837 | 799 | 4.40 (1.24 to 7.44) |
| bishop-colour | heldout | phase | opening | 572 | 274 | 298 | -2.68 (-8.24 to 2.73) |
| bishop-colour | heldout | phase | middlegame | 1704 | 852 | 852 | 5.52 (2.28 to 8.68) |
| bishop-colour | heldout | phase | endgame | 724 | 375 | 349 | 6.00 (2.22 to 9.75) |
| trades-level | train | close | false | 3177 | 775 | 2402 | 2.52 (-0.11 to 5.21) |
| trades-level | train | close | true | 2823 | 1260 | 1563 | 4.88 (2.43 to 7.47) |
| trades-level | train | band | 1300 | 2567 | 842 | 1725 | 3.30 (0.48 to 6.16) |
| trades-level | train | band | 1500 | 3433 | 1193 | 2240 | -1.19 (-3.56 to 1.18) |
| trades-level | train | phase | opening | 3000 | 1107 | 1893 | 0.87 (-1.67 to 3.27) |
| trades-level | train | phase | middlegame | 3000 | 928 | 2072 | 0.59 (-2.05 to 3.29) |
| trades-level | train | phase | endgame | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| trades-level | train | tradePiece | n | 3453 | 1467 | 1986 | 3.88 (1.59 to 6.20) |
| trades-level | train | tradePiece | b | 2101 | 471 | 1630 | -7.37 (-10.78 to -3.93) |
| trades-level | train | tradePiece | r | 199 | 41 | 158 | -6.51 (-17.82 to 5.23) |
| trades-level | train | tradePiece | q | 247 | 56 | 191 | 0.87 (-9.64 to 11.85) |
| trades-level | heldout | close | false | 1591 | 367 | 1224 | 0.74 (-3.10 to 4.59) |
| trades-level | heldout | close | true | 1409 | 645 | 764 | 3.77 (0.15 to 7.53) |
| trades-level | heldout | band | 1300 | 1332 | 421 | 911 | 0.85 (-3.29 to 5.06) |
| trades-level | heldout | band | 1500 | 1668 | 591 | 1077 | -2.64 (-6.17 to 0.81) |
| trades-level | heldout | phase | opening | 1450 | 524 | 926 | 0.38 (-3.24 to 3.95) |
| trades-level | heldout | phase | middlegame | 1550 | 488 | 1062 | -2.70 (-6.68 to 1.18) |
| trades-level | heldout | phase | endgame | 0 | 0 | 0 | undefined (interval undefined; 2000 missing draws) |
| trades-level | heldout | tradePiece | n | 1715 | 695 | 1020 | 2.51 (-0.72 to 5.98) |
| trades-level | heldout | tradePiece | b | 1055 | 263 | 792 | -7.50 (-12.30 to -2.58) |
| trades-level | heldout | tradePiece | r | 105 | 25 | 80 | 4.13 (-9.83 to 17.49) |
| trades-level | heldout | tradePiece | q | 125 | 29 | 96 | -15.79 (-30.99 to -0.28) |
| hang | train | close | false | 1024 | 742 | 282 | 28.25 (23.42 to 32.81) |
| hang | train | close | true | 1412 | 799 | 613 | 26.92 (23.36 to 30.51) |
| hang | train | band | 1300 | 1070 | 664 | 406 | 31.01 (26.89 to 35.20) |
| hang | train | band | 1500 | 1366 | 877 | 489 | 27.56 (23.71 to 31.28) |
| hang | train | phase | opening | 422 | 256 | 166 | 22.84 (16.24 to 29.74) |
| hang | train | phase | middlegame | 1732 | 1098 | 634 | 29.47 (26.21 to 32.70) |
| hang | train | phase | endgame | 282 | 187 | 95 | 37.23 (29.35 to 44.58) |
| hang | heldout | close | false | 542 | 413 | 129 | 26.13 (19.01 to 33.03) |
| hang | heldout | close | true | 718 | 386 | 332 | 26.50 (21.39 to 31.58) |
| hang | heldout | band | 1300 | 572 | 373 | 199 | 30.41 (24.59 to 36.14) |
| hang | heldout | band | 1500 | 688 | 426 | 262 | 27.03 (21.72 to 32.49) |
| hang | heldout | phase | opening | 211 | 130 | 81 | 22.85 (12.84 to 32.50) |
| hang | heldout | phase | middlegame | 930 | 592 | 338 | 30.33 (25.44 to 35.01) |
| hang | heldout | phase | endgame | 119 | 77 | 42 | 24.35 (11.06 to 36.18) |
