// Builds the moat calibration dataset: full fundamentals for the reference stocks, plus margins and
// revenue for every peer in their industries (for industry medians and market-share rank).
// Usage: FMP_API_KEY=... NODE_USE_ENV_PROXY=1 CACHE_DIR=... node scripts/moat-dataset.mjs > dataset.json
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fetchUniverse, fetchFundamentals, fmpGet } from '../shared/fmp.js';
import { buildMetrics } from '../shared/metrics.js';

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

import { WIDE, COMMODITY, OTHERS } from './moat-lists.js';

const symbols = [...new Set([...WIDE, ...COMMODITY, ...OTHERS])];
const universe = await cached('universe', () => fetchUniverse(KEY));
const uniBy = Object.fromEntries(universe.map((u) => [u.symbol, u]));
const today = new Date();
console.error(`reference stocks: ${symbols.length}`);
const raws = await pool(symbols, 3, (s) => cached(`f_${s}`, () => fetchFundamentals(s, KEY, today)));
const metrics = raws.map((r) => buildMetrics(r, uniBy[r.symbol], today)).filter((m) => m.name);

// Peers: every universe stock in the same industries (margins + revenue only).
const industries = new Set(metrics.map((m) => m.industry));
const peers = universe.filter((u) => industries.has(u.industry) && !symbols.includes(u.symbol));
console.error(`peers: ${peers.length}`);
const peerRows = await pool(peers, 3, (u) => cached(`peer2_${u.symbol}`, async () => {
  const [rt, sc] = await Promise.all([
    fmpGet('ratios-ttm', { symbol: u.symbol }, KEY).catch(() => []),
    fmpGet('financial-scores', { symbol: u.symbol }, KEY).catch(() => []),
  ]);
  return { symbol: u.symbol, industry: u.industry, sector: u.sector, operatingMargin: rt[0]?.operatingProfitMarginTTM ?? null, grossMargin: rt[0]?.grossProfitMarginTTM ?? null, revenueTtm: sc[0]?.revenue ?? null };
}));
const label = (s) => (WIDE.includes(s) ? 'wide' : COMMODITY.includes(s) ? 'commodity' : 'other');
process.stdout.write(JSON.stringify({ metrics: metrics.map((m) => ({ ...m, label: label(m.symbol) })), peers: peerRows }));
console.error('done');
