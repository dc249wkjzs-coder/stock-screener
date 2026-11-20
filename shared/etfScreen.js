// ETF finder: the boxes, the ready-made presets, the matching rule and the URL form (so a screen can be bookmarked).
// Separate from the stock screen (shared/criteria.js) because funds have no earnings: cost, size, mix, returns, timing.

export const ETF_CATEGORIES = ['Broad market', 'Sector', 'International', 'Bonds', 'Commodities & crypto', 'Leveraged / inverse'];
export const ETF_SECTORS = ['Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical', 'Consumer Defensive', 'Industrials',
  'Energy', 'Utilities', 'Real Estate', 'Basic Materials', 'Communication Services'];

// Empty = no filter. Fractions throughout (costMax 0.001 = 0.10%).
export const ETF_BLANK = {
  cats: [],          // categories to include (empty = all except leveraged, unless showLev)
  sector: '',        // a sector the fund must hold…
  sectorMin: 0.3,    // …at least this share of
  costMax: null,     // max expense ratio
  aumMin: 500e6,     // min fund size
  divMin: null,      // min dividend yield
  chg1yMin: null,    // min 1-year price change
  betaMax: null,     // max beta
  dropMax: null,     // deepest drop in ~2 years no worse than this (0.3 = −30%)
  usMin: null,       // min share in US companies
  entry: 'any',      // any | zone (buy zone, wait or bouncing) | bouncing | off10 | off20
  showLev: false,    // include leveraged / inverse funds
  q: '',             // name, ticker or fund company contains
  sort: 'aum',
};

export const ETF_PRESETS = [
  { id: 'broad-cheap', label: 'Broad market, low cost', hint: 'Whole-market funds for 0.10% a year or less, $10B+ in size', set: { cats: ['Broad market'], costMax: 0.001, aumMin: 10e9, sort: 'cost' } },
  { id: 'dividend', label: 'Dividend', hint: 'Stock funds paying 3%+, costing 0.40% or less', set: { cats: ['Broad market', 'Sector', 'International'], divMin: 0.03, costMax: 0.004, aumMin: 1e9, sort: 'div' } },
  { id: 'sector', label: 'Sector bets', hint: 'One-sector funds, $1B+, 0.60% or less', set: { cats: ['Sector'], costMax: 0.006, aumMin: 1e9, sort: 'chg1y' } },
  { id: 'growth-tech', label: 'Growth / tech', hint: '40%+ in technology, up 10%+ in a year', set: { cats: ['Broad market', 'Sector'], sector: 'Technology', sectorMin: 0.4, chg1yMin: 0.1, aumMin: 1e9, sort: 'chg1y' } },
  { id: 'international', label: 'International', hint: 'Mostly outside the US, 0.40% or less, $1B+', set: { cats: ['International'], costMax: 0.004, aumMin: 1e9, sort: 'aum' } },
  { id: 'bonds', label: 'Bonds', hint: 'Bond funds, 0.30% or less, $1B+', set: { cats: ['Bonds'], costMax: 0.003, aumMin: 1e9, sort: 'aum' } },
  { id: 'low-vol', label: 'Steady', hint: 'Stock funds with beta 0.8 or less and no drop worse than 20% in ~2 years', set: { cats: ['Broad market', 'Sector', 'International'], betaMax: 0.8, dropMax: 0.2, aumMin: 1e9, sort: 'aum' } },
  { id: 'pullback', label: 'In a buy zone', hint: 'Stock funds at a Fibonacci buy level right now, $1B+', set: { cats: ['Broad market', 'Sector', 'International'], entry: 'zone', aumMin: 1e9, sort: 'aum' } },
];

export const ETF_SORTS = {
  aum: { label: 'Fund size', get: (e) => e.aum, desc: true },
  cost: { label: 'Cost (lowest first)', get: (e) => e.expenseRatio, desc: false },
  div: { label: 'Dividend yield', get: (e) => e.dividendYield, desc: true },
  chg1y: { label: '1-year change', get: (e) => e.chg1y, desc: true },
  offHigh: { label: 'Furthest below 52-week high', get: (e) => e.offHigh, desc: false },
  beta: { label: 'Beta (steadiest first)', get: (e) => e.beta, desc: false },
};

const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));
const weightIn = (e, sector) => (e.sectors || []).find((x) => x.s === sector)?.w ?? 0;

// Each active box → { label, ok }. An ETF matches when every box is ok.
export function etfChecks(e, c) {
  const out = [];
  const add = (label, ok) => out.push({ label, ok: !!ok });
  if (!c.showLev && e.leveraged) add('Not leveraged or inverse', false);
  if (c.cats?.length) add(`Category: ${c.cats.join(', ')}`, c.cats.includes(e.category));
  if (c.sector) add(`${Math.round((c.sectorMin ?? 0.3) * 100)}%+ in ${c.sector}`, weightIn(e, c.sector) >= (c.sectorMin ?? 0.3));
  if (has(c.costMax)) add(`Cost ≤ ${(c.costMax * 100).toFixed(2)}%`, e.expenseRatio != null && e.expenseRatio <= c.costMax + 1e-9);
  if (has(c.aumMin)) add(`Fund size ≥ $${c.aumMin >= 1e9 ? `${c.aumMin / 1e9}B` : `${c.aumMin / 1e6}M`}`, e.aum >= c.aumMin);
  if (has(c.divMin)) add(`Dividend ≥ ${(c.divMin * 100).toFixed(1)}%`, e.dividendYield >= c.divMin);
  if (has(c.chg1yMin)) add(`1-year change ≥ ${Math.round(c.chg1yMin * 100)}%`, e.chg1y != null && e.chg1y >= c.chg1yMin);
  if (has(c.betaMax)) add(`Beta ≤ ${c.betaMax}`, e.beta != null && e.beta <= c.betaMax);
  if (has(c.dropMax)) add(`Deepest drop no worse than −${Math.round(c.dropMax * 100)}%`, e.pullbackMax != null && e.pullbackMax >= -c.dropMax);
  if (has(c.usMin)) add(`${Math.round(c.usMin * 100)}%+ in US companies`, e.usShare != null && e.usShare >= c.usMin);
  if (c.entry && c.entry !== 'any') {
    const st = e.setup?.status || '';
    const ok = c.entry === 'zone' ? /^zone/.test(st) : c.entry === 'bouncing' ? st === 'zone-confirmed'
      : c.entry === 'off10' ? e.offHigh != null && e.offHigh <= -0.1 : c.entry === 'off20' ? e.offHigh != null && e.offHigh <= -0.2 : true;
    add({ zone: 'In a buy zone', bouncing: 'Buy zone · bouncing', off10: '10%+ below 52-week high', off20: '20%+ below 52-week high' }[c.entry], ok);
  }
  if (c.q?.trim()) {
    const q = c.q.trim().toUpperCase();
    add(`Contains "${c.q.trim()}"`, e.symbol.includes(q) || (e.name || '').toUpperCase().includes(q) || (e.issuer || '').toUpperCase().includes(q));
  }
  return out;
}
export const etfMatches = (e, c) => etfChecks(e, c).every((k) => k.ok);

export function etfScreen(etfs, c) {
  const s = ETF_SORTS[c.sort] || ETF_SORTS.aum;
  return etfs.filter((e) => etfMatches(e, c)).sort((a, b) => {
    const x = s.get(a), y = s.get(b);
    if (x == null && y == null) return (b.aum || 0) - (a.aum || 0);
    if (x == null) return 1;
    if (y == null) return -1;
    return s.desc ? y - x : x - y;
  });
}

// URL form: only the boxes that differ from blank, short keys.
const KEYS = { cats: 'c', sector: 'sec', sectorMin: 'sw', costMax: 'cost', aumMin: 'aum', divMin: 'div', chg1yMin: 'y1', betaMax: 'beta', dropMax: 'drop', usMin: 'us', entry: 'entry', showLev: 'lev', q: 'q', sort: 'sort' };
export function etfToParams(c) {
  const p = new URLSearchParams();
  for (const [k, short] of Object.entries(KEYS)) {
    const v = c[k], b = ETF_BLANK[k];
    if (k === 'cats') { if (v?.length) p.set(short, v.join('|')); continue; }
    if (v === b || v == null || v === '') continue;
    p.set(short, String(v));
  }
  return p;
}
export function etfFromParams(p) {
  const c = { ...ETF_BLANK };
  for (const [k, short] of Object.entries(KEYS)) {
    if (!p.has(short)) continue;
    const v = p.get(short);
    if (k === 'cats') c.cats = v.split('|').filter((x) => ETF_CATEGORIES.includes(x));
    else if (k === 'showLev') c.showLev = v === 'true';
    else if (['sector', 'entry', 'q', 'sort'].includes(k)) c[k] = v;
    else c[k] = has(v) ? Number(v) : null;
  }
  return c;
}
