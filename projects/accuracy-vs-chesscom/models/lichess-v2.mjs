// The instrument the review used before coach-accuracy/3, frozen and
// self-contained so the bench can still score it: Lichess's per-move curve
// (decay 0.0435, with the flat +1) and its aggregation, the mean of a
// volatility-weighted mean and the harmonic mean. Book, forced and unknown
// plies were left out, as they still are.

const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411 + 1));

function stdev(xs) {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1));
}

function volatilityWeights(winSeq, windowSize) {
  const plies = Math.max(0, winSeq.length - 1);
  const size = Math.max(2, Math.min(windowSize, Math.max(2, winSeq.length)));
  const slide = [];
  for (let i = 0; i + size <= winSeq.length; i++) slide.push(winSeq.slice(i, i + size));
  if (slide.length === 0) slide.push([...winSeq]);
  const windows = [];
  for (let k = 0; k < size - 2; k++) windows.push(slide[0]);
  windows.push(...slide);
  const out = [];
  for (let i = 0; i < plies; i++) out.push(Math.max(0.5, Math.min(12, stdev(windows[Math.min(i, windows.length - 1)]))));
  return out;
}

export function accuracy(records, color, ctx) {
  let last = ctx.rootWin ?? 50;
  const winSeq = [last];
  for (const r of records) {
    if (r.winAfter !== null && r.winAfter !== undefined) last = r.winAfter;
    winSeq.push(last);
  }
  const mine = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i].mover !== color || !ctx.lib.graded(records[i])) continue;
    mine.push({ index: i, acc: moveAccuracy(records[i].lossPct) });
  }
  if (!mine.length) return null;
  const weights = volatilityWeights(winSeq, Math.max(2, Math.min(8, Math.floor(mine.length / 10))));
  let accW = 0, wSum = 0, invSum = 0;
  for (const m of mine) {
    const w = weights[m.index] ?? 0.5;
    accW += m.acc * w;
    wSum += w;
    invSum += 1 / m.acc;
  }
  return ((wSum > 0 ? accW / wSum : 0) + mine.length / invSum) / 2;
}
