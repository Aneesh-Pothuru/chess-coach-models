# Where the app converts a rating for Maia

This audit reads app commit `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`.
Paths and line numbers below are in that app. It covers every executable
reference to `defaultMaiaElo` and `toLichess`, their injected callbacks, and
the callers that carry their settings. No app file was changed.

## The conversions

`src/services/engine/maia/levels.ts:14` defines `toLichess`. It adds the
rounded, clamped offset and rounds the result. `defaultMaiaElo` at line 68
calls it at line 69, then uses the app's category and level functions.
The allowed offset is 0 to 500 and the default is 250. These functions do
not know whose rating they receive.

| Caller | Whose rating it converts | How the result is used |
|---|---|---|
| `src/services/engine/maia/human.ts:51` | The human player facing the Maia bot | `maiaMove` converts `playerRapid` with the request's offset for the model's opponent input. The bot's own input is its explicit Maia band. |
| `src/services/engine/maia/human.ts:115` | The person whose move is assessed | `findabilityAt` selects that person's band with its supplied offset. The whole curve faces an equal-band opponent. |
| `src/services/engine/play/bot.ts:78` | The human player | `resolveBot` describes the selected bot relative to the player's converted band. |
| `src/services/engine/play/bot.ts:123` | The human player | `maiaOptions` marks a bot band as the player's level. |
| `src/services/engine/play/bot.ts:151` | The human player | `playerOnMaiaScale` returns the converted rating without snapping to a band. It is exported but has no internal caller. |
| `src/features/play/Play.tsx:67` | The human player | Selects the bot band when the setting follows the player's rating. |
| `src/features/play/Setup.tsx:172` | The human player | Displays the converted rating beside the offset setting. |
| `src/services/review/punish.ts:56` | The replier after the error | `replyPolicies` reads the next side to move's game rating. It uses the implicit default offset and equal-band conditioning. |
| `src/services/review/pipeline/defenses.ts:29` | The defender against the mover's best move | `defenseProbes` reads the opposite side's game rating. It uses the implicit default offset and equal-band conditioning. |
| `src/adapters/node/learner/level.ts:67,78,83` | The human player | Live, fallback and synchronous level resolution pass `defaultMaiaElo` into `levelReading` as `eloOf`. |

The callback is invoked at `src/services/learner/level.ts:136`, with the
player's current rapid rating and profile offset. A replier or defender can
be the player or his opponent. The error-maker's identity alone does not
select the offset for the reply.

## Equal-band policies

`src/services/engine/service.ts:377` defaults an omitted `opponentBand` to
`'same'`. `humanPolicyAt`, in `src/services/engine/maia/human.ts:79–98`, then
uses the requested self band for both inputs. Punish and defense omit this
argument. Findability explicitly requests `'same'` at `human.ts:116`.

The app's punish odds therefore do not condition on the actual error-maker's
band. This project keeps that instrument for the guard. The likelihood
comparison instead uses both people's converted game ratings, as its
predecessor did. Changing the punish instrument to actual-opponent
conditioning would be another change to measure.

## Settings, wrappers and tools

There is one profile offset. Its field is in
`src/services/profile/types.ts:209`, its schema in `schema.ts:153`, its
default in `defaults.ts:49`, and its parsing in `parse.ts:122,135`.
`src/app/services/profile.ts:52–53` and
`src/adapters/node/profile/index.ts:21–22` supply the app's clamp and default.
The play screen reads the setting at `Play.tsx:63` and writes it at
`Setup.tsx:167`. `useCoachedGame.ts:83` places it in the bot context;
`bot.ts:80,157` carries it through the resolved bot and persona to `maiaMove`.
The Node learner reads it at `src/adapters/node/learner/level.ts:24–25`.
Review's punish and defense calls neither read nor receive this setting.

| Reference | Role |
|---|---|
| `src/services/engine/index.ts:122,128` | Re-exports the two conversion functions. |
| `tools/coach-review/level.cjs:5,18` | Imports and exports `defaultMaiaElo` under `maiaEloFor`; level resolution delegates to the Node learner. No production call of that alias was found. |
| `src/cli/commands/doctor.ts:119–120` | Checks that the bridge exports `defaultMaiaElo` as a function. It does not convert a rating. |
| `src/cli/commands/engine.ts:107` | Calls findability for the supplied rapid rating, with no offset argument. The default is used. |
| `src/cli/commands/engine.ts:115` | Requests human policies with no opponent band, hence equal-band conditioning. |
| `tools/coach-review/findability.py:65,90–92` | Reads the current player's cached Maia band and runs Python inference at that band against itself. |
| `tools/coach-review/plan-walk.py:93,130–131` | Reads the same player band. The player's choices and the opponent replies both use it in both model inputs. |

The Python tools are existing app callers. This project does not use their
inference backend.

## Tests and documentation

| Test | Direct conversion references |
|---|---|
| `tests/maiaBand.test.ts:14,21,32` | Tool/app parity, defaults and profile offset. |
| `tests/maiaOpponent.test.ts:209,211,212,216` | Forward conversion, inverse and clamping. |
| `tests/maiaOpponent.test.ts:221–225,288` | Band selection and the matching bot. |
| `src/services/review/punish.test.ts:53–55,163` | The replier's band, distinguished from the error-maker's band. |
| `src/services/review/defenses.test.ts:83,85,120` | The defender's band. |
| `src/services/learner/level.test.ts:22,24,25` | Injected engine conversion. |

Related tests cover findability in
`src/services/engine/service.test.ts:601–605`, profile parsing in
`src/services/profile/parse.test.ts`, and the profile offset in
`src/cli/player.test.ts`.

Documentation-only references are in
`docs/proposal/reports/01-engine.md:28,152`,
`tools/coach-review/README.md:22`,
`src/services/engine/README.md:81–82`,
`src/services/review/README.md:191,214,344`, and
`src/services/learner/README.md:356`.

## What a port must carry

A needs owner identity and both offsets in review and defense. Their present
arguments contain only the white and black player records. The pipeline
calls them at `src/services/review/pipeline/run.ts:282,312`; browser backfill
calls `replyPolicies` at `src/features/gamereview/usePunishOdds.ts:22`.
`Game.me` exists, but is not part of those function arguments. The port must
carry that identity and conversion settings through both paths. The README
fixes the unknown-owner fallback at 250.

The player's offset applies to his findability, learner level, displayed
rating, and the human opponent input of a bot policy. An explicit bot band
already uses Maia's scale. Choosing a matching bot and describing its
chess.com strength also need consistent semantics; this experiment does
not validate synthetic bot difficulty. The old plan-walk tool uses the
player's band for both people and would need side-aware inputs to implement
A there.

B needs the same rating function at every forward conversion. Bot labels
also need an inverse. `maiaLevelsFor`, at `levels.ts:60–65`, currently calls
`toChesscom`, whose definition at line 18 subtracts a constant. A varying
offset cannot use that inverse. Derive labels from the monotone forward
map and define rounding ties in the port.

Either port must update profile fields, defaults, schemas, parsing, UI and
tests together, and refresh cached learner levels. Punish, defense and
findability retain equal-band conditioning. No port is included here.
