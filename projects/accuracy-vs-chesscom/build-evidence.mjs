// Builds the evidence the accuracy eval re-reads: one finished game-review/2
// document per case and profile, made by the real entry point
// (`coach review cc:<id> --profile <p> --json --no-cache`: a fresh engine and
// no eval cache for every game, so a document depends only on the code and
// the game). The engine is deterministic at fixed nodes on one thread, so a
// rebuild at the same commit gives the same documents.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile routine \
//     [--out private/accuracy-vs-chesscom/evidence] [--concurrency 4] [--timeout-s 3600] [--games FILE]
//
// The reviews run in the app checkout the bridge pins (CHESS_DIR), on the cases
// build-cases.mjs wrote (or the games --games names, in the same shape); the
// documents describe the player's games, so they stay under private/.
//
// Resumable: a case whose document is already on disk is skipped. Each
// finished case appends its wall-clock seconds to <out>/<profile>/_timing.jsonl;
// a failure appends to <out>/<profile>/_errors.jsonl and never leaves a
// document behind.

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs';

const FLOW_DIR = privateDir('accuracy-vs-chesscom');
const ROOT = CHESS_DIR;
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');

function parseArgs(argv) {
  const a = { profile: null, out: join(FLOW_DIR, 'evidence'), concurrency: 4, timeoutS: 3600, only: null, games: join(FLOW_DIR, 'cases.json') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      if (argv[i + 1] === undefined) { console.error(`missing value for ${k}`); process.exit(2); }
      return argv[++i];
    };
    if (k === '--profile') a.profile = val();
    else if (k === '--out') a.out = val();
    else if (k === '--concurrency') a.concurrency = Number(val());
    else if (k === '--timeout-s') a.timeoutS = Number(val());
    else if (k === '--only') a.only = new Set(val().split(','));
    else if (k === '--games') a.games = val();
    else { console.error(`unknown argument: ${k}`); process.exit(2); }
  }
  if (!/^(phone|desktop|routine)$/.test(a.profile ?? '')
      || !Number.isInteger(a.concurrency) || a.concurrency < 1
      || !Number.isFinite(a.timeoutS) || a.timeoutS <= 0) {
    console.error('usage: bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone|desktop|routine [--out DIR] [--concurrency N] [--timeout-s N] [--only id,id] [--games FILE]');
    process.exit(2);
  }
  return a;
}

/** One review through the CLI; resolves to the parsed document or rejects with the reason. */
function reviewOnce(c, profile, timeoutS) {
  return new Promise((resolvePromise, reject) => {
    // Its own process group, so a ceiling kills the CLI and the engine it spawned together.
    const child = spawn(TSX, ['src/cli/coach.ts', 'review', c.game, '--profile', profile, '--json', '--no-cache'], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    const out = [];
    let err = '';
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => { err = (err + d).slice(-4000); });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      reject(Object.assign(new Error(`exceeded ${timeoutS}s`), { failure_class: 'timeout' }));
    }, timeoutS * 1000);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(Object.assign(new Error(`coach review exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`), { failure_class: 'cli_error' }));
      let doc;
      try { doc = JSON.parse(Buffer.concat(out).toString('utf8')); }
      catch (e) { return reject(Object.assign(new Error(`unparseable output: ${e.message}`), { failure_class: 'cli_error' })); }
      // A document missing what the eval reads is a failed build, not a result.
      if (doc?.schema !== 'game-review/2' || !Array.isArray(doc.positions) || !Array.isArray(doc.records) || !doc.white || !doc.black || !doc.provenance) {
        return reject(Object.assign(new Error('output is not a game-review/2 document'), { failure_class: 'cli_error' }));
      }
      if (doc.provenance.profile !== profile) {
        return reject(Object.assign(new Error(`document says profile ${doc.provenance.profile}, asked for ${profile}`), { failure_class: 'cli_error' }));
      }
      resolvePromise(doc);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = JSON.parse(readFileSync(args.games, 'utf8')).filter(c => !args.only || args.only.has(String(c.id)));
  const dir = join(args.out, args.profile);
  mkdirSync(dir, { recursive: true });
  const todo = cases.filter(c => {
    const p = join(dir, `${c.id}.json`);
    if (!existsSync(p)) return true;
    try { JSON.parse(readFileSync(p, 'utf8')); return false; } catch { return true; }
  });
  console.error(`[${args.profile}] ${todo.length} of ${cases.length} cases to build -> ${dir}`);
  let next = 0, ok = 0, failed = 0;
  const t0 = Date.now();
  const progress = () => {
    const done = ok + failed;
    const el = (Date.now() - t0) / 1000;
    const eta = done ? Math.round((el / done) * (todo.length - done)) : null;
    const line = `[${args.profile}] ${done}/${todo.length} done (${ok} ok, ${failed} failed), ${Math.round(el)}s elapsed${eta != null ? `, ~${eta}s left` : ''}`;
    console.error(line);
    try { writeFileSync(join(dir, '_progress.txt'), line + '\n'); } catch { /* best effort */ }
  };
  const tick = setInterval(progress, 30_000);
  async function worker() {
    while (next < todo.length) {
      const c = todo[next++];
      const started = Date.now();
      try {
        const doc = await reviewOnce(c, args.profile, args.timeoutS);
        const seconds = (Date.now() - started) / 1000;
        const p = join(dir, `${c.id}.json`);
        writeFileSync(p + '.tmp', JSON.stringify(doc));
        renameSync(p + '.tmp', p);
        appendFileSync(join(dir, '_timing.jsonl'), JSON.stringify({
          id: c.id, profile: args.profile, seconds, plies: doc.records.length,
          build: doc.provenance.build, verified: doc.coverage.verified, flagged: doc.coverage.flagged,
          at: new Date().toISOString(),
        }) + '\n');
        ok++;
      } catch (e) {
        failed++;
        appendFileSync(join(dir, '_errors.jsonl'), JSON.stringify({
          id: c.id, profile: args.profile, failure_class: e?.failure_class ?? 'error', error: String(e?.message || e),
          seconds: (Date.now() - started) / 1000, at: new Date().toISOString(),
        }) + '\n');
        console.error(`  [${args.profile}] ${c.id} FAILED: ${e?.message || e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, Math.max(1, todo.length)) }, worker));
  clearInterval(tick);
  progress();
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(String(e?.stack || e)); process.exit(2); });
