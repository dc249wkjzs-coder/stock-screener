// "Choose your own" screen: the categories a visitor picks, the presets, matching, and the risk meter.
// Plain JS shared by the site and the tests. A criterion left at "Any" (null/false/empty) is not applied.

const SECTOR = (name) => (s) => s.sector === name;
const INDUSTRY = (re) => (s) => re.test(s.industry || '');

// Industries people ask for, mapped to FMP sectors/industries. A stock can sit in more than one (NVDA = Technology + Semis).
export const THEMES = [
  { id: 'tech', label: 'Technology', match: SECTOR('Technology') },
  { id: 'semis', label: 'Semiconductors', match: INDUSTRY(/Semiconductor/) },
  { id: 'software', label: 'Software', match: INDUSTRY(/Software/) },
  { id: 'health', label: 'Healthcare & medical', match: SECTOR('Healthcare') },
  { id: 'defense', label: 'Defense & aerospace', match: INDUSTRY(/Aerospace|Defense/) },
  { id: 'staples', label: 'Consumer staples', match: SECTOR('Consumer Defensive') },
  { id: 'discretionary', label: 'Consumer discretionary', match: SECTOR('Consumer Cyclical') },
  { id: 'comms', label: 'Communication & media', match: SECTOR('Communication Services') },
  { id: 'financials', label: 'Financials', match: SECTOR('Financial Services') },
  { id: 'industrials', label: 'Industrials', match: SECTOR('Industrials') },
  { id: 'energy', label: 'Energy', match: SECTOR('Energy') },
  { id: 'utilities', label: 'Utilities', match: SECTOR('Utilities') },
  { id: 'materials', label: 'Materials', match: SECTOR('Basic Materials') },
  { id: 'realestate', label: 'Real estate', match: SECTOR('Real Estate') },
];

export const BLANK = {
  themes: [], moatMin: null, debtMax: null, peMin: null, peMax: null, pegMax: null, growthMin: null,
  marginMin: null, revGrowthMin: null, fcfYieldMin: null, dividendMin: null, profitable: false, noDilution: false, capMin: null, betaMax: null, aiRiskMax: null, entry: 'any',
  // added 2026-11-13 for the investor strategies
  roicMin: null, magicTop: null, payoutMax: null, capMax: null, chg1yMin: null, dropMax: null,
  piotroskiMin: null, altmanMin: null, coverMin: null, aiBenefitMin: null,
};

export const PRESETS = [
  { id: 'quality', label: 'Quality compounder', blurb: 'Strong moat, fair price for its growth, low debt, real profits.',
    c: { moatMin: 7, pegMax: 2, growthMin: 0.10, debtMax: 3, profitable: true, noDilution: true } },
  { id: 'defensive', label: 'Defensive', blurb: 'Large, steady, low-debt companies that move less than the market.',
    c: { moatMin: 6, debtMax: 2, profitable: true, capMin: 10e9, betaMax: 0.9 } },
  { id: 'value', label: 'Value', blurb: 'Cheap on earnings, profitable, healthy margins.',
    c: { peMax: 15, pegMax: 1.5, debtMax: 3, marginMin: 0.15, profitable: true } },
  { id: 'garp', label: 'Growth at a fair price', blurb: 'Fast earnings growth without paying too much for it.',
    c: { growthMin: 0.20, pegMax: 1.5, marginMin: 0.15, profitable: true } },
  { id: 'aggressive', label: 'Aggressive growth', blurb: 'The fastest expected earnings growth, whatever the price.',
    c: { growthMin: 0.30 } },
];

// Investor strategies: well-known approaches, each a fixed set of boxes (shown separately from the quick-start presets).
export const STRATEGIES = [
  { id: 'magic', label: 'Magic Formula', who: 'Joel Greenblatt', blurb: 'Top 10% on the Magic Formula: high profit for the price plus high return on capital. Banks, insurers and utilities are left out, as in the original.',
    c: { magicTop: 0.10 } },
  { id: 'divgrow', label: 'Dividend grower', blurb: 'Dividend of 2%+, less than 60% of profit paid out (room to raise it), low debt, moat 6+.',
    c: { dividendMin: 0.02, payoutMax: 0.6, debtMax: 2, moatMin: 6, profitable: true } },
  { id: 'buffett', label: 'Buffett-style', who: 'Warren Buffett', blurb: 'Wonderful business at a fair price: moat 7+, return on capital 15%+ (5-year median), low debt, forward P/E up to 25.',
    c: { moatMin: 7, roicMin: 0.15, debtMax: 2, peMax: 25, profitable: true } },
  { id: 'lynch', label: 'Peter Lynch', blurb: 'Growth you are not overpaying for: PEG under 1, earnings growth 10%+, sales growing, mid-sized ($2B–$50B).',
    c: { pegMax: 1, growthMin: 0.10, revGrowthMin: 0.05, capMin: 2e9, capMax: 50e9, profitable: true } },
  { id: 'fallen', label: 'Fallen quality', blurb: 'Strong businesses on sale: moat 7+ and 20%+ below the 52-week high.',
    c: { moatMin: 7, entry: 'off20', profitable: true } },
  { id: 'cash', label: 'Cash machines', blurb: 'Free cash flow yield of 5%+, profitable, low debt.',
    c: { fcfYieldMin: 0.05, debtMax: 2, profitable: true } },
  { id: 'lowvol', label: 'Low volatility', blurb: 'Calm stocks: beta 0.8 or less, deepest drop in 2 years no worse than 25%, profitable.',
    c: { betaMax: 0.8, dropMax: 0.25, profitable: true } },
  { id: 'ai', label: 'AI winners', blurb: 'AI benefit 7+ and AI risk 3 or less. Only covers the stocks rated so far.',
    c: { aiBenefitMin: 7, aiRiskMax: 3 } },
  { id: 'momentum', label: 'Momentum', blurb: 'Up 25%+ over the last year and still profitable. Strong trends tend to carry on for a while, until they don\'t.',
    c: { chg1yMin: 0.25, profitable: true } },
  { id: 'smallgrowth', label: 'Small-cap growth', blurb: 'Companies worth $500M–$5B with expected earnings growth of 20%+.',
    c: { capMax: 5e9, growthMin: 0.20 } },
  { id: 'strong', label: 'Financially strong', blurb: 'Top financial-health scores: Piotroski 7+, Altman Z 3+ (safe zone), interest covered 10x+ or net cash.',
    c: { piotroskiMin: 7, altmanMin: 3, coverMin: 10, profitable: true } },
];

// What each box offers. value null = "Any".
export const OPTIONS = {
  moatMin: [null, 3, 4, 5, 6, 7, 8, 9, 10],
  debtMax: [null, 5, 3, 2, 1, 0],
  peMin: [null, 5, 10, 15, 20],
  peMax: [null, 60, 40, 30, 25, 20, 15, 10],
  pegMax: [null, 3, 2, 1.5, 1],
  growthMin: [null, 0, 0.05, 0.10, 0.15, 0.20, 0.30],
  marginMin: [null, 0.10, 0.15, 0.25, 0.40],
  capMin: [null, 2e9, 10e9, 50e9, 200e9],
  betaMax: [null, 2, 1.5, 1.2, 1, 0.8],
  aiRiskMax: [null, 5, 3],
  revGrowthMin: [null, 0, 0.05, 0.10, 0.20],
  fcfYieldMin: [null, 0, 0.03, 0.05],
  dividendMin: [null, 0.0001, 0.01, 0.02, 0.03, 0.04],
  entry: ['any', 'zone', 'confirmed', 'off20'],
  roicMin: [null, 0.10, 0.15, 0.20, 0.30],
  magicTop: [null, 0.25, 0.10, 0.05],
  payoutMax: [null, 0.8, 0.6, 0.4],
  capMax: [null, 5e9, 10e9, 50e9, 200e9],
  chg1yMin: [null, 0, 0.10, 0.25, 0.50],
  dropMax: [null, 0.50, 0.35, 0.25],
  piotroskiMin: [null, 5, 7, 8],
  altmanMin: [null, 1.8, 3],
  coverMin: [null, 3, 5, 10],
  aiBenefitMin: [null, 5, 7],
};

const pct = (v) => `${Math.round(v * 100)}%`;
const usdB = (v) => (v >= 1e9 ? `$${v / 1e9}B` : `$${v / 1e6}M`);
export const optionLabel = (key, v) => {
  if (v == null || v === 'any') return key === 'entry' ? 'Any time' : 'Any';
  switch (key) {
    case 'moatMin': return `${v}+`;
    case 'debtMax': return v === 0 ? 'Net cash only' : `Up to ${v}x`;
    case 'peMin': return `${v}+`;
    case 'peMax': return `Up to ${v}`;
    case 'pegMax': return `Up to ${v}`;
    case 'growthMin': return `${pct(v)}+`;
    case 'marginMin': return `${pct(v)}+`;
    case 'capMin': return `${usdB(v)}+`;
    case 'betaMax': return `Up to ${v}`;
    case 'aiRiskMax': return `Up to ${v}`;
    case 'revGrowthMin': return `${pct(v)}+`;
    case 'fcfYieldMin': return v === 0 ? 'Positive' : `${pct(v)}+ yield`;
    case 'dividendMin': return v < 0.001 ? 'Pays one' : `${pct(v)}+ yield`;
    case 'roicMin': return `${pct(v)}+`;
    case 'magicTop': return `Top ${pct(v)}`;
    case 'payoutMax': return `Up to ${pct(v)}`;
    case 'capMax': return `Up to ${usdB(v)}`;
    case 'chg1yMin': return v === 0 ? 'Up' : `Up ${pct(v)}+`;
    case 'dropMax': return `No worse than −${pct(v)}`;
    case 'piotroskiMin': return `${v}+ of 9`;
    case 'altmanMin': return v >= 3 ? `${v}+ (safe)` : `${v}+ (not distressed)`;
    case 'coverMin': return `${v}x+`;
    case 'aiBenefitMin': return `${v}+`;
    case 'entry': return { zone: 'Near a buy level', confirmed: 'Bounce confirmed', off20: '20%+ below its high' }[v];
    default: return String(v);
  }
};

// One check per active criterion: { key, label, ok, why }. Missing data counts as not matching.
export function checks(s, c) {
  const C = { ...BLANK, ...c };
  const out = [];
  const add = (key, label, ok, why) => out.push({ key, label, ok: !!ok, why });
  const x = (v, d = 1) => (v == null ? 'no data' : `${v.toFixed(d)}x`);
  const moat = s.moatUsed ?? s.moatOverride ?? s.moat?.score ?? null;
  if (C.themes.length) {
    const hit = THEMES.filter((t) => C.themes.includes(t.id) && t.match(s)).map((t) => t.label);
    add('themes', 'Industry', hit.length, hit.length ? hit.join(', ') : `${s.sector || '?'} · ${s.industry || '?'}`);
  }
  if (C.moatMin != null) add('moatMin', 'Moat', moat != null && moat >= C.moatMin, moat == null ? 'no moat score' : `${moat}/10`);
  if (C.debtMax != null) {
    const nd = s.netDebtToEbitda;
    add('debtMax', 'Debt', nd != null && (C.debtMax === 0 ? nd <= 0 : nd <= C.debtMax), nd == null ? 'no data' : nd <= 0 ? 'net cash' : `net debt ${x(nd)} EBITDA`);
  }
  if (C.peMin != null || C.peMax != null) {
    const pe = s.forwardPE;
    add('pe', 'Forward P/E', pe != null && pe > 0 && (C.peMin == null || pe >= C.peMin) && (C.peMax == null || pe <= C.peMax), pe == null ? 'no forward estimate' : x(pe));
  }
  if (C.pegMax != null) add('pegMax', 'PEG', s.peg != null && s.peg <= C.pegMax, x(s.peg, 2));
  if (C.growthMin != null) add('growthMin', 'EPS growth', s.epsGrowth != null && s.epsGrowth >= C.growthMin, s.epsGrowth == null ? 'no estimate' : `${pct(s.epsGrowth)} a year expected`);
  if (C.marginMin != null) add('marginMin', 'EBITDA margin', s.ebitdaMargin != null && s.ebitdaMargin >= C.marginMin, s.ebitdaMargin == null ? 'no data' : pct(s.ebitdaMargin));
  if (C.profitable) add('profitable', 'Profitable', s.gaapLossTtm === false, s.gaapLossTtm == null ? 'no data' : s.gaapLossTtm ? 'GAAP loss over the last 12 months' : 'GAAP profit over the last 12 months');
  if (C.noDilution) {
    const bad = (s.recentRaises || []).find((r) => ['equity', 'convert', 'atm'].includes(r.kind));
    add('noDilution', 'No recent share sales', !bad, bad ? `${{ equity: 'stock offering', convert: 'convertible', atm: 'at-the-market program' }[bad.kind]} filed ${bad.date}` : 'none found in 90 days');
  }
  if (C.capMin != null) add('capMin', 'Company size', s.marketCap >= C.capMin, s.marketCap ? `${usdB(Math.round(s.marketCap / 1e8) * 1e8)} market cap` : 'no data');
  if (C.betaMax != null) add('betaMax', 'Volatility (beta)', s.beta != null && s.beta <= C.betaMax, s.beta == null ? 'no data' : s.beta.toFixed(2));
  if (C.revGrowthMin != null) add('revGrowthMin', 'Sales growth', s.revenueGrowth != null && s.revenueGrowth >= C.revGrowthMin, s.revenueGrowth == null ? 'no data' : `${pct(s.revenueGrowth)} last year`);
  if (C.fcfYieldMin != null) add('fcfYieldMin', 'Free cash flow', s.fcfYield != null && (C.fcfYieldMin === 0 ? s.fcfYield > 0 : s.fcfYield >= C.fcfYieldMin), s.fcfYield == null ? 'no data' : `free cash flow yield ${(s.fcfYield * 100).toFixed(1)}%`);
  if (C.dividendMin != null) add('dividendMin', 'Dividend', s.dividendYield != null && s.dividendYield >= C.dividendMin, !s.dividendYield ? 'no dividend' : `${(s.dividendYield * 100).toFixed(1)}% yield`);
  if (C.capMax != null) add('capMax', 'Company size (max)', s.marketCap != null && s.marketCap <= C.capMax, s.marketCap ? `${usdB(Math.round(s.marketCap / 1e8) * 1e8)} market cap` : 'no data');
  if (C.roicMin != null) add('roicMin', 'Return on capital', s.roic != null && s.roic >= C.roicMin, s.roic == null ? 'no data' : `${pct(s.roic)} (5-year median)`);
  if (C.magicTop != null) {
    const share = s.magicRank != null && s.magicOf ? s.magicRank / s.magicOf : null;
    add('magicTop', 'Magic Formula', share != null && share <= C.magicTop, share == null ? 'not ranked (banks, insurers, utilities or missing data)' : `rank ${s.magicRank} of ${s.magicOf} (top ${Math.max(1, Math.ceil(share * 100))}%)`);
  }
  if (C.payoutMax != null) add('payoutMax', 'Dividend payout', s.payoutRatio != null && s.payoutRatio >= 0 && s.payoutRatio <= C.payoutMax, s.payoutRatio == null ? 'no data' : `${pct(s.payoutRatio)} of profit paid out`);
  if (C.chg1yMin != null) add('chg1yMin', 'Price change (1 year)', s.chg1y != null && (C.chg1yMin === 0 ? s.chg1y > 0 : s.chg1y >= C.chg1yMin), s.chg1y == null ? 'no price history' : `${s.chg1y >= 0 ? '+' : ''}${pct(s.chg1y)} over 12 months`);
  if (C.dropMax != null) add('dropMax', 'Past drops', s.pullbackMax != null && -s.pullbackMax <= C.dropMax, s.pullbackMax == null ? 'no price history' : `deepest drop in ~2 years −${pct(-s.pullbackMax)}`);
  if (C.piotroskiMin != null) add('piotroskiMin', 'Piotroski score', s.piotroski != null && s.piotroski >= C.piotroskiMin, s.piotroski == null ? 'no data' : `${s.piotroski} of 9`);
  if (C.altmanMin != null) add('altmanMin', 'Altman Z-score', s.altmanZ != null && s.altmanZ >= C.altmanMin, s.altmanZ == null ? 'no data' : s.altmanZ.toFixed(1));
  if (C.coverMin != null) {
    const netCash = s.netDebtToEbitda != null && s.netDebtToEbitda <= 0;
    add('coverMin', 'Interest cover', netCash || (s.interestCoverage != null && s.interestCoverage >= C.coverMin), netCash ? 'net cash' : s.interestCoverage == null ? 'no data' : `profit covers interest ${s.interestCoverage.toFixed(1)}x`);
  }
  if (C.aiBenefitMin != null) add('aiBenefitMin', 'AI benefit', s.aiBenefit != null && s.aiBenefit >= C.aiBenefitMin, s.aiBenefit == null ? 'not rated yet' : `${s.aiBenefit}/10`);
  if (C.aiRiskMax != null) add('aiRiskMax', 'AI risk', s.aiRisk != null && s.aiRisk <= C.aiRiskMax, s.aiRisk == null ? 'not rated yet' : `${s.aiRisk}/10`);
  if (C.entry !== 'any') {
    const st = s.setup?.status;
    const ok = C.entry === 'zone' ? ['zone', 'zone-confirmed'].includes(st) : C.entry === 'confirmed' ? st === 'zone-confirmed' : s.offHigh != null && s.offHigh <= -0.20;
    add('entry', 'Entry timing', ok, C.entry === 'off20' ? (s.offHigh == null ? 'no price history' : `${pct(-s.offHigh)} below its 52-week high`) : s.setup?.title || 'no data');
  }
  return out;
}

export const matches = (s, c) => checks(s, c).every((k) => k.ok);
export const activeCount = (c) => checks({}, c).length;

// ---- Risk meter: a reading of the matching stocks, not of the settings alone.
// Six measures, each scored 0 (low risk) to 4 (high risk), averaged.
const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const band = (v, cuts) => { if (v == null) return null; let i = 0; while (i < cuts.length && v >= cuts[i]) i++; return i; };

export const RISK_LEVELS = [
  { max: 1, label: 'Lower risk', tone: 'gain' },
  { max: 2, label: 'Moderate risk', tone: 'accent' },
  { max: 3, label: 'High risk', tone: 'warn' },
  { max: Infinity, label: 'Very high risk', tone: 'loss' },
];

export function riskProfile(stocks) {
  if (!stocks.length) return null;
  const beta = median(stocks.map((s) => s.beta));
  const lossShare = stocks.filter((s) => s.gaapLossTtm).length / stocks.length;
  const debt = median(stocks.map((s) => (s.netDebtToEbitda == null ? null : Math.max(0, s.netDebtToEbitda))));
  const pe = median(stocks.map((s) => (s.forwardPE > 0 ? s.forwardPE : null)));
  const drop = median(stocks.map((s) => s.pullbackMax));
  const moat = median(stocks.map((s) => s.moatUsed ?? s.moat?.score));
  const factors = [
    { key: 'beta', label: 'Volatility', value: beta, text: beta == null ? null : `median beta ${beta.toFixed(2)} (the market = 1.00)`, score: band(beta, [0.8, 1.0, 1.2, 1.5]) },
    { key: 'losses', label: 'Losses', value: lossShare, text: `${Math.round(lossShare * 100)}% of the stocks lost money (GAAP, last 12 months)`, score: band(lossShare, [0.0001, 0.05, 0.15, 0.30]) },
    { key: 'debt', label: 'Debt', value: debt, text: debt == null ? null : debt === 0 ? 'median company has net cash' : `median net debt ${debt.toFixed(1)}x EBITDA`, score: band(debt, [1, 2, 3, 4]) },
    { key: 'valuation', label: 'Valuation', value: pe, text: pe == null ? null : `median forward P/E ${pe.toFixed(1)}`, score: band(pe, [15, 20, 30, 45]) },
    { key: 'drawdowns', label: 'Past drops', value: drop, text: drop == null ? null : `median deepest fall in ~2 years ${Math.round(-drop * 100)}%`, score: drop == null ? null : band(-drop, [0.15, 0.25, 0.35, 0.50]) },
    { key: 'moat', label: 'Moat', value: moat, text: moat == null ? null : `median moat ${moat}/10`, score: moat == null ? null : 4 - band(moat, [4, 5, 6, 7]) },
  ].filter((f) => f.score != null);
  const score = factors.reduce((a, f) => a + f.score, 0) / factors.length;
  const level = RISK_LEVELS.find((l) => score < l.max);
  const drivers = [...factors].sort((a, b) => b.score - a.score);
  return { score, level, factors, drivers, n: stocks.length, concentrated: stocks.length < 8 };
}

// ---- URL <-> criteria (so a screen can be bookmarked).
const NUM = ['moatMin', 'debtMax', 'peMin', 'peMax', 'pegMax', 'growthMin', 'marginMin', 'revGrowthMin', 'fcfYieldMin', 'dividendMin', 'capMin', 'betaMax', 'aiRiskMax',
  'roicMin', 'magicTop', 'payoutMax', 'capMax', 'chg1yMin', 'dropMax', 'piotroskiMin', 'altmanMin', 'coverMin', 'aiBenefitMin'];
export function toParams(c) {
  const p = new URLSearchParams();
  const C = { ...BLANK, ...c };
  if (C.themes.length) p.set('themes', C.themes.join(','));
  for (const k of NUM) if (C[k] != null) p.set(k, String(C[k]));
  if (C.profitable) p.set('profitable', '1');
  if (C.noDilution) p.set('noDilution', '1');
  if (C.entry !== 'any') p.set('entry', C.entry);
  return p;
}
export function fromParams(p) {
  const c = { ...BLANK, themes: (p.get('themes') || '').split(',').filter(Boolean) };
  for (const k of NUM) if (p.get(k) != null && p.get(k) !== '') c[k] = Number(p.get(k));
  c.profitable = p.get('profitable') === '1';
  c.noDilution = p.get('noDilution') === '1';
  c.entry = p.get('entry') || 'any';
  return c;
}
