// Scores the calibration set with the current moat formula and reports how well it separates
// Morningstar wide-moat names from textbook no-moat (price-competitive) industries.
// Usage: CACHE_DIR=... node scripts/moat-eval.mjs [SYMBOL ...]   (extra symbols: print their breakdown)
import { readFileSync, readdirSync } from 'node:fs';
import { buildMetrics } from '../shared/metrics.js';
import { buildContext, moatScore } from '../shared/crossSection.js';
import { WIDE, COMMODITY, OTHERS } from './moat-lists.js';

const CACHE = process.env.CACHE_DIR || '.cache';
const read = (f) => JSON.parse(readFileSync(`${CACHE}/${f}`, 'utf8'));
const universe = read('universe.json');
const uniBy = Object.fromEntries(universe.map((u) => [u.symbol, u]));
const files = new Set(readdirSync(CACHE));
const syms = [...new Set([...WIDE, ...COMMODITY, ...OTHERS])].filter((s) => files.has(`f_${s}.json`));
const metrics = syms.map((s) => buildMetrics(read(`f_${s}.json`), uniBy[s])).filter((m) => m.name);
const peers = [...files].filter((f) => f.startsWith('peer2_')).map(read);
const ctx = buildContext([...metrics, ...peers]);

const rows = metrics.map((m) => ({ m, r: moatScore(m, ctx) }));
const grp = (list) => rows.filter((x) => list.includes(x.m.symbol));
const dist = (g) => {
  const sc = g.map((x) => x.r.score).filter((v) => v != null);
  const hist = Array.from({ length: 10 }, (_, i) => sc.filter((v) => v === i + 1).length);
  return { n: sc.length, avg: (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1), hist: hist.map((c, i) => `${i + 1}:${c}`).join(' ') };
};
const w = grp(WIDE), c = grp(COMMODITY);
const wd = dist(w), cd = dist(c);
console.log(`WIDE (Morningstar, n=${wd.n}) avg ${wd.avg} | ${wd.hist}`);
console.log(`   7+: ${w.filter((x) => x.r.score >= 7).length}/${wd.n}   ≤5: ${w.filter((x) => x.r.score != null && x.r.score <= 5).map((x) => `${x.m.symbol}(${x.r.score})`).join(' ')}`);
console.log(`NO-MOAT industries (n=${cd.n}) avg ${cd.avg} | ${cd.hist}`);
console.log(`   ≤5: ${c.filter((x) => x.r.score <= 5).length}/${cd.n}   7+: ${c.filter((x) => x.r.score >= 7).map((x) => `${x.m.symbol}(${x.r.score})`).join(' ')}`);
console.log('OTHERS: ' + grp(OTHERS).map((x) => `${x.m.symbol} ${x.r.score ?? '–'}`).join(' · '));
for (const s of process.argv.slice(2)) {
  const x = rows.find((y) => y.m.symbol === s);
  if (!x) { console.log(`\n${s}: no data`); continue; }
  console.log(`\n${s} ${x.m.industry} → ${x.r.score} (raw ${x.r.raw?.toFixed(2)})`);
  for (const p of x.r.parts || []) console.log(`   ${p.label.padEnd(30)} ${String(p.pts).padStart(5)} / ${p.max}  ${p.detail}`);
  if (x.r.reason) console.log('   ' + x.r.reason);
}
