#!/usr/bin/env node
// Counts the two audit fixes' sentence forms in the explanations the records
// actually retain. Never turns an absent cases.json into a count of zero.
// No engine, Maia, app pipeline or model judge runs here.
//   node projects/explain-top-move/grader-impact.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAB_DIR, records, resultsDir } from '../../bridge/lib/lab.mjs';
import { score } from './judge/pairwise.mjs';

const FLOW = 'explain-top-move';
const J = p => JSON.parse(readFileSync(p, 'utf8'));
const L = p => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
// The two fixes remove false positives on app-generated forms. For a decimal,
// old evalCheck compares an integer fragment to evalString's mandatory decimal.
// For mate-too, teachMove names a bestUci distinct from uci; the old template
// therefore fails its playedUci check. See the generated report's assumptions.
const keyOf = r => `${r.id}:${r.textHash}`;
const gameOf = id => id.slice(0, id.lastIndexOf('-'));
const hash = c => createHash('sha256').update(JSON.stringify([c.texts?.cardShows, c.texts?.commentFor, c.texts?.lessonFor, c.texts?.retryTeaching, c.texts?.whyLabel])).digest('hex').slice(0, 16);
const strings = x => typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : [];

export function forms(texts) {
  const evals = texts.flatMap(t => [...t.matchAll(/\bThe eval moved to ([+−-]?\d+(?:\.\d+)?)\.(?=\s|$)/g)].map(m => m[1]))
    .filter(v => v.includes('.') || Number(v.replace('−', '-')) <= 0);
  const mates = texts.flatMap(t => [...t.matchAll(/\bAfter [^\s,:.()]+, [^.]*?\bmate in \d+ too\b/g)]);
  return { eval: evals.length, positive: evals.filter(x => Number(x.replace('−', '-')) > 0).length,
    zero: evals.filter(x => Number(x.replace('−', '-')) === 0).length,
    negative: evals.filter(x => Number(x.replace('−', '-')) < 0).length, mateToo: mates.length };
}

// Exactly the fields gradeMoment walks for faithful. The hidden comment on a
// lesson card is not graded, nor are the lesson's folded grade/evidence fields.
export function visibleFields(c) {
  const t = c.texts ?? {}, l = t.lessonFor;
  const lesson = l => [l.headline, l.takeaway, ...(l.yourMove ?? []), ...(l.allowed?.points ?? []), ...(l.better?.points ?? []), ...(l.difference ?? [])].filter(Boolean);
  return [...(t.cardShows === 'lesson' && l ? lesson(l) : [t.commentFor].filter(Boolean)),
    ...[t.retryTeaching?.hint, t.retryTeaching?.reason].filter(Boolean)];
}
const zero = () => ({ eval: 0, positive: 0, zero: 0, negative: 0, mateToo: 0 });
const add = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k]; return a; };

export function bounds(before, after, observations) {
  let delta = 0, baseUnknown = 0, newUnknown = 0, changed = 0;
  for (const b of after) {
    const a = before.get(b.id);
    if (!a) throw new Error('unpaired moment');
    delta += b.faithful - a.faithful;
    if (a.textHash === b.textHash) continue; // Same text, same round evidence.
    changed++;
    const mayChange = r => {
      const known = observations.get(keyOf(r));
      return !r.faithful && (!known || known.eval + known.mateToo > 0);
    };
    baseUnknown += Number(mayChange(a)); newUnknown += Number(mayChange(b));
  }
  return { delta, changed, baseUnresolved: baseUnknown, newUnresolved: newUnknown,
    lower: delta - baseUnknown, upper: delta + newUnknown };
}

function main() {
  const rec = records(), flow = join(rec, '.claude/hillclimb', FLOW), judge = join(rec, 'evals', FLOW, 'judge');
  const state = J(join(flow, '_state.json')), pin = J(join(LAB_DIR, 'bridge/chess.json'));
  const split = new Map([...state.train_ids.map(x => [String(x), 'train']), ...state.test_ids.map(x => [String(x), 'test'])]);
  const setSplits = { main: split };
  for (const [set, k] of [['endgames', 'endgame_set'], ['endgames2', 'endgame_set2']])
    setSplits[set] = new Map(J(join(rec, state[k].file)).games.map(g => [String(g.id), g.split]));
  const variants = ['1','2','3','4','5','6','7','7b','8','9','10','11','12','13','14','15','16','17','17b','17c','18','19','20','20b','21','22','22b','23','24','25','26'];
  const oldVariant = { '1':'baseline','2':'v1','3':'v2','4':'v3','5':'v4','6':'v4','7':'v6','7b':'v6','8':'v7b','9':'v8' };
  const pairs = variants.map(round => {
    const v = `v${round}`, rebuilt = join(flow, v, 'rebuilt');
    const sets = [];
    if (oldVariant[round]) sets.push({ set:'main', before:L(join(flow, oldVariant[round], 'results.jsonl')), after:L(join(flow, v, 'results.jsonl')) });
    else if (existsSync(rebuilt)) for (const set of ['main','endgames','endgames2']) {
      const d = set === 'main' ? rebuilt : join(rebuilt, set);
      if (existsSync(join(d, 'base.results.jsonl'))) sets.push({ set, before:L(join(d,'base.results.jsonl')), after:L(join(d,`${v}.results.jsonl`)) });
    }
    return { round, sets };
  });
  const observations = new Map(), full = new Map();
  const cases = J(join(rec, 'evals', FLOW, 'cases.json'));
  for (const c of cases) {
    const k = keyOf({ id:c.id, textHash:hash(c) }), counts = forms(visibleFields(c));
    observations.set(k, counts); full.set(k, forms(strings(c.texts)));
  }
  const baseline = L(join(flow, 'baseline/results.jsonl'));
  if (baseline.length !== cases.length || baseline.some(x => !full.has(keyOf(x)))) throw new Error('the full snapshot is no longer the baseline');
  const judgeRows = [];
  for (const p of pairs) {
    const dir = join(judge, `round${p.round === '6' ? '5' : p.round}`);
    if (!existsSync(join(dir, 'items-r1.json'))) continue;
    const changed = p.round === '6' ? new Set(p.sets.flatMap(s => s.after.filter(r => s.before.find(a => a.id === r.id)?.textHash !== r.textHash).map(r => r.id))) : null;
    const items = J(join(dir, 'items-r1.json')).items.filter(i => !changed || changed.has(i.id)), keys = J(join(dir,'key-r1.json'));
    const labels = [...new Set(Object.values(keys).flatMap(k => [k.X,k.Y]))];
    if (!labels.every(x => x === 'old' || x === 'new' || /^v\d+[a-z]?$/.test(x))) throw new Error('unknown judge arm labels');
    const order = v => { const m=/^v(\d+)([a-z]?)$/.exec(v); return Number(m[1])*100+(m[2]?.charCodeAt(0) ?? 0); };
    const newer = labels.includes('new') ? 'new' : labels.sort((a,b)=>order(a)-order(b)).at(-1);
    const reverse = new Map(J(join(dir,'items-r2.json')).items.map(i => [i.id,i])), reverseKeys = J(join(dir,'key-r2.json'));
    for (const i of items) {
      const j=reverse.get(i.id);
      if (!j || JSON.stringify(i.versionX)!==JSON.stringify(j.versionY) || JSON.stringify(i.versionY)!==JSON.stringify(j.versionX) || keys[i.id].X!==reverseKeys[i.id].Y || keys[i.id].Y!==reverseKeys[i.id].X) throw new Error('judge second run is not the same arms reversed');
    }
    if (p.round === '6') {
      const five = new Map(L(join(flow,'v5/results.jsonl')).map(r=>[r.id,r.textHash]));
      if (p.sets.flatMap(s=>s.after).some(r=>changed.has(r.id) && five.get(r.id)!==r.textHash)) throw new Error('round 6 no longer retains the exact round 5 text on its changed moments');
    }
    const lookups = Object.fromEntries(['before','after'].map(arm => [arm,new Map(p.sets.flatMap(s => s[arm]).map(r => [r.id,r]))]));
    const totals = { before:zero(), after:zero() };
    for (const i of items) for (const arm of ['before','after']) {
      const isNew = arm === 'after';
      const xNew = keys[i.id].X === 'new' || (!['old','new'].includes(keys[i.id].X) && keys[i.id].X === newer);
      const text = i[isNew === xNew ? 'versionX' : 'versionY'].map(s => s.text), counts = forms(text);
      add(totals[arm], counts);
      const r = lookups[arm].get(i.id);
      if (!r) throw new Error(`round ${p.round}: a judge item has no grade row`);
      const k = keyOf(r), prior = observations.get(k);
      if (prior && (prior.eval !== counts.eval || prior.mateToo !== counts.mateToo)) throw new Error('same text hash gives inconsistent counts');
      observations.set(k, counts);
    }
    const sampled = join(judge, p.round === '17b' ? 'round17' : `round${p.round}`, 'sample.json');
    const only = changed ?? (existsSync(sampled) ? new Set(J(sampled).counted) : null);
    const scored = score([dir], only);
    judgeRows.push({ round:p.round, moments:items.length, counted:items.filter(i => !only || only.has(i.id)).length, before:totals.before, after:totals.after, ...scored });
  }
  const finalJudges = [['7 final',['round7','round7b'],null],['17 final',['round17','round17b'],'round17'],['22 final',['round22','round22b'],'round22']].map(([round, dirs, sample]) => ({ round, ...score(dirs.map(d => join(judge,d)), sample ? new Set(J(join(judge,sample,'sample.json')).counted) : null) }));
  const rows = [], paired = [], unresolved = [];
  for (const p of pairs) for (const s of p.sets) for (const which of ['train','test']) {
    const selected = arm => s[arm].filter(r => setSplits[s.set].get(gameOf(r.id)) === which);
    for (const arm of ['before','after']) {
      const rs = selected(arm), counts = zero(); let covered = 0, fullCovered = 0;
      for (const r of rs) {
        const o = observations.get(keyOf(r));
        if (o) { covered++; add(counts, o); }
        if (full.has(keyOf(r))) fullCovered++;
        else if (!o) unresolved.push({ round:p.round, set:s.set, split:which, arm, id:r.id, faithful:r.faithful, textHash:r.textHash });
      }
      rows.push({ round:p.round, set:s.set, split:which, arm, moments:rs.length, covered, fullCovered, unknown:rs.length-covered, ...counts });
    }
    const before = new Map(selected('before').map(x => [x.id,x]));
    paired.push({ round:p.round, set:s.set, split:which, ...bounds(before,selected('after'),observations) });
  }
  const snapshot = { moments:cases.length, raw:cases.reduce((t,c) => add(t, forms(strings(c.texts))),zero()),
    graded:cases.reduce((t,c) => add(t, forms(visibleFields(c))),zero()),
    hiddenCommentEvals:cases.filter(c=>c.texts?.cardShows==='lesson' && c.texts?.lessonFor).reduce((n,c)=>n+forms([c.texts.commentFor ?? '']).eval,0) };
  if (cases.some(c => strings(c.texts).some(t => /\bThe eval moved to (?:[+−-]?0|[−-]\d+)\.(?=\s|$)/.test(t)))) throw new Error('the baseline numeric forms are no longer all decimals');
  if (snapshot.raw.eval !== snapshot.hiddenCommentEvals || snapshot.graded.eval || snapshot.graded.mateToo || rows.some(r=>r.eval || r.mateToo)) throw new Error('the zero observed-exposure report needs revising for these records');
  const report = { app:pin.commit, records:pin.records, rule:state.keep_rule, snapshot, judge:judgeRows, finalJudges, rows, paired,
    absentRounds:pairs.filter(p => !p.sets.length).map(p => p.round) };
  const out = resultsDir(FLOW), privateOut = join(LAB_DIR,'private/lab-audit/explain-top-move');
  mkdirSync(privateOut,{recursive:true});
  writeFileSync(join(privateOut,'uncovered.json'),JSON.stringify(unresolved,null,2)+'\n');
  writeFileSync(join(out,'grader-impact.json'),JSON.stringify(report,null,2)+'\n');
  const lines = [
    '# The two grader fixes: stored-text counts', '',
    `Generated by \`projects/explain-top-move/grader-impact.mjs\`. App pin \`${pin.commit}\`; research records \`${pin.records}\`. No engine, Maia or judge ran. No rule changed.`, '',
    `The complete stored cases file is the original baseline: all ${snapshot.moments} text hashes match its results. Its stored comment fields contain ${snapshot.raw.eval} decimal-eval sentences (${snapshot.raw.positive} positive, ${snapshot.raw.zero} zero, ${snapshot.raw.negative} negative). Every one is hidden behind a lesson card. The fields the grader actually reads contain ${snapshot.graded.eval} decimal-eval sentences and ${snapshot.graded.mateToo} mate-too sentences.`, '',
    'The numeric scan includes any decimal, integer zero and negative integers as well. A count is an occurrence, not a unique sentence. Judge runs reverse the same texts, so only run one is counted. Both arms are counted separately. Round 6 reuses round 5 only after checking that each selected v6 text hash equals v5\'s. Each second judge run is checked to contain the same texts with arms reversed. The judge omits a hidden fallback comment and the folded grade text, as does faithful. It also omits a lesson shown only on the Why sheet; full faithfulAll coverage requires cases.json.', '',
    'The records do not retain each variant\'s cases.json. They retain per-moment grades and a hash of all text fields. The table below gives the counts in the stored judge texts. A zero here is not a census of an unobserved full variant.', '',
    '| round | stored / counted moments per arm | old eval / mate-too | new eval / mate-too | judge margin, train / test (new minus old) |',
    '|---|---:|---:|---:|---:|',
    ...judgeRows.map(r => `| ${r.round} | ${r.moments} / ${r.counted} | ${r.before.eval} / ${r.before.mateToo} | ${r.after.eval} / ${r.after.mateToo} | ${r.tally.train.new-r.tally.train.old} / ${r.tally.test.new-r.tally.test.old} |`), '',
    'Final replacement-run margins: ' + finalJudges.map(r => `${r.round}: train ${r.tally.train.new-r.tally.train.old}, test ${r.tally.test.new-r.tally.test.old}`).join('; ') + '.', '',
    'Every covered visible-text entry in every graded round and arm has zero of both forms; the coverage table distinguishes that observation from unknown moments. The fixes do not change any judge answer or margin. The rule needs a positive margin on both halves, together with each round\'s grade and correctness checks. The JSON report keeps every set and split, each arm\'s observed counts and its unknown coverage.', '',
    '| graded round | old visible moments covered / total | new visible moments covered / total | faithful difference range, worst set and split | effect on its grade gate |',
    '|---|---:|---:|---:|---|',
  ];
  for (const p of pairs) {
    if (!p.sets.length) { lines.push(`| ${p.round} | unavailable | unavailable | unavailable | the recorded one-moment failed gate needs its cases; no per-moment grade file retained |`); continue; }
    const rs = rows.filter(r => r.round === p.round), ps = paired.filter(r => r.round === p.round);
    const coverage = arm => { const a=rs.filter(x=>x.arm===arm); return `${a.reduce((n,x)=>n+x.covered,0)} / ${a.reduce((n,x)=>n+x.moments,0)}`; };
    const lo=Math.min(...ps.map(x=>x.lower)), hi=Math.min(...ps.map(x=>x.upper));
    const verdict = p.round === '7' ? 'the intermediate variant already fails; final 7b is below' : ['5','9','13'].includes(p.round) ? 'rejected by unchanged judge votes' : ['1','2'].includes(p.round) && lo > 0 ? 'faithful still strictly improves on both halves under the bound' : p.round === '17c' ? 'equality rule: missing changed texts need the exact pair' : lo < 0 ? 'unresolved: missing changed texts can cross the no-fall bar' : 'no fall possible under the paired-text bound; not a full re-grade';
    lines.push(`| ${p.round} | ${coverage('before')} | ${coverage('after')} | ${lo} to ${hi} moments | ${verdict} |`);
  }
  lines.push('',
    'These are conditional sensitivity bounds, not certified re-grades. They assume each retained grade used the two affected old matchers and the paired arms read the same recorded evidence, as their plans state. Missing cases prevent a direct check of those premises. On app-generated sentences the changes can only remove false positives: the old decimal matcher removes the fractional part, but evalString always prints a decimal for a finite CP score (including .0), so the fragment cannot equal the expected value. For mate-too, teachMove first requires bestUci different from uci, then mateWords names bestSan; the old generic matcher checks that against playedUci, so it must fail. These paths are in grade.mjs (COMMENT_TEMPLATES, evalString and the two mate templates), the cached app lesson.ts (teachMove, mateWords), and the records source. No missing text was assumed absent.', '',
    'Only a currently failed faithful grade can recover from these false-positive fixes. A stored zero in both sentence forms cannot recover. Identical paired text hashes cancel because each round compares both arms on the same evidence. Changed, failed moments with no stored visible text remain unknown. Concrete, named_deep, defect counters and the judge are untouched. Positive bounds preserve an improvement; zero preserves a no-fall gate, but cannot establish a strict improvement where one is required. The JSON gives the old difference and both arms\' unresolved moments for every set and split.', '',
    'Round 20 was stopped for a different new false claim (the king attacking a defended rook), documented in v20/change.md; neither fixed form is that claim. Its full counts cannot be recovered from the retained change note. Rounds 5, 9 and 13 remain rejected by unchanged judge votes. Round 17c only changes the folded grade text, which neither fixed template reads; its all-grades-equal check still needs the exact pair for a literal re-grade.', '',
    'For the missing full counts or a complete re-grade, supply each round\'s original before/after cases.json, including its stored before/after scores, best/reply PVs, capture probes, defense probes and texts. Put the copies under private/lab-audit/explain-top-move/<round>/<set>/<arm>/cases.json. grade.mjs accepts that file directly with --out in the same private directory; no engine search is needed. Match the visible text hash to that round\'s retained results.jsonl before comparing grades. Per-moment unknown coverage is in private/lab-audit/explain-top-move/uncovered.json.', '',
    'If only evidence documents can be copied, build-cases.mjs defaults to private/accuracy-vs-chesscom/cases.json and private/accuracy-vs-chesscom/evidence/phone/<id>.json. It explicitly uses the phone profile, not routine documents. It also needs each round\'s exact saved probes.json and (from round 12) defenses.json, supplied through --probes and --defenses, and the exact app variant. Their defaults are private/explain-top-move/probes.json and private/explain-top-move/defenses.json; the output is private/explain-top-move/cases.json. The original pre-round-10 documents and each later rebuilt document cohort must match; a newly rebuilt baseline is not proof of a historical count. For the endgame sets, use full games.json files and evidence/phone/<id>.json under private/explain-top-move/endgames/ and endgames2/, with saved searches in each base\'s all/probes.json and all/defenses.json. Round 16–17c count only endgame moments of the first set; round 18 onward count all its moments and the second set. The saved lists v16/endgame-set.json and v18/endgame-set2.json in the records are split manifests, not the full games.json rows. No missing evidence was rebuilt.', '');
  writeFileSync(join(out,'grader-impact.md'),lines.join('\n'));
  console.log(JSON.stringify({snapshot, judgeRounds:judgeRows.length, gradedRounds:pairs.length, absentRounds:report.absentRounds,
    unresolvedGradeGates:[...new Set(paired.filter(r=>r.lower<0).map(r=>r.round))]},null,2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
