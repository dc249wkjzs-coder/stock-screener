// Local test: pull live FMP data for a list of tickers, score them, print a table.
// Usage: FMP_API_KEY=... node scripts/calibrate.mjs OKTA WMT COST ...
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fetchUniverse, fetchFundamentals, fetchPriceHistory, fmpGet } from '../shared/fmp.js';
import { buildMetrics } from '../shared/metrics.js';
import { buildContext, moatScore, magicFormulaRanks } from '../shared/crossSection.js';
import { priceStats, fibonacci } from '../shared/indicators.js';
import { evaluate } from '../shared/pillars.js';
import { makeCard } from '../shared/card.js';

const KEY = process.env.FMP_API_KEY;
const CACHE = process.env.CACHE_DIR || '.cache';
mkdirSync(CACHE, { recursive: true });
const cached = async (name, fn) => {
  const f = `${CACHE}/${name}.json`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const v = await fn(); writeFileSync(f, JSON.stringify(v)); return v;
};
const pool = async (items, n, fn) => {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
};

const symbols = process.argv.slice(2);
const universe = await cached('universe', () => fetchUniverse(KEY));
const uniBy = Object.fromEntries(universe.map((u) => [u.symbol, u]));
const today = new Date();

const raws = await pool(symbols, 4, (s) => cached(`f_${s}`, () => fetchFundamentals(s, KEY, today)));
const prices = await pool(symbols, 4, (s) => cached(`p_${s}`, () => fetchPriceHistory(s, KEY, '2024-06-01')));
const metrics = raws.map((r, i) => ({ ...buildMetrics(r, uniBy[r.symbol], today), ...priceStats(prices[i]), fib: fibonacci(prices[i]) }));

// Peers for the industry parts of the moat score: margins + revenue for every stock in the same industries.
const industries = new Set(metrics.map((m) => m.industry));
const peers = universe.filter((u) => industries.has(u.industry) && !symbols.includes(u.symbol));
console.error(`peers to fetch: ${peers.length}`);
const peerRows = await pool(peers, 6, (u) => cached(`peer_${u.symbol}`, async () => {
  const [rt, sc] = await Promise.all([
    fmpGet('ratios-ttm', { symbol: u.symbol }, KEY).catch(() => []),
    fmpGet('financial-scores', { symbol: u.symbol }, KEY).catch(() => []),
  ]);
  return { symbol: u.symbol, industry: u.industry, sector: u.sector, operatingMargin: rt[0]?.operatingProfitMarginTTM ?? null, revenueTtm: sc[0]?.revenue ?? null };
}));
const ctx = buildContext([...metrics, ...peerRows]);
for (const m of metrics) { m.moat = moatScore(m, ctx); m.industrySize = ctx.industrySize[m.industry]; }
const mf = magicFormulaRanks(metrics);

const f = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
const pc = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
console.log(['sym', 'price', 'moat', 'fwdPE', 'gr', 'PEG', 'ebitda%', 'ND/E', 'RSI', 'off-hi', 'overall', 'first fail / note'].join('\t'));
for (const m of metrics) {
  const e = evaluate(m);
  console.log([m.symbol, f(m.price, 2), m.moat.score, f(m.forwardPE), pc(m.epsGrowth), f(m.peg, 2), pc(m.ebitdaMargin), f(m.netDebtToEbitda),
    f(m.rsi14, 0), pc(m.offHigh), e.overall, e.firstFail ? `${e.firstFail}: ${e.pillars[e.firstFail].why}` : (e.missing.join(',') || '')].join('\t'));
}
writeFileSync(`${CACHE}/scored.json`, JSON.stringify(metrics.map((m) => ({ ...m, eval: evaluate(m), magic: mf[m.symbol] })), null, 1));

// Demo data for the website (public/sample.json) when SAMPLE_OUT is set.
if (process.env.SAMPLE_OUT) {
  const cards = metrics.map((m, i) => {
    const tech = { ...priceStats(prices[i]), fib: m.fib };
    return {
      ...makeCard(m, tech, m.moat, mf[m.symbol]), moatParts: m.moat.parts, fib: m.fib,
      metricsSample: m, pricesSample: prices[i].slice(-260).map(([date, close]) => ({ date, close })),
    };
  });
  const owned = ['NVDA', 'MSFT', 'FTNT', 'TDG', 'AVGO', 'KLAC', 'LRCX', 'META', 'GOOGL', 'AMZN', 'LLY', 'SNPS', 'TMO', 'NOC', 'AXON', 'BWXT', 'GEV'];
  const positions = [
    ...owned.map((s) => ({ symbol: s, status: 'owned', shares: 40, avg_cost: 100, asset_class: 'stock' })),
    { symbol: 'WMT', status: 'prospect', asset_class: 'stock' },
  ];
  writeFileSync(process.env.SAMPLE_OUT, JSON.stringify({ scoredAt: new Date().toISOString(), cards, positions }));
  console.error(`sample written: ${cards.length} stocks`);
}
