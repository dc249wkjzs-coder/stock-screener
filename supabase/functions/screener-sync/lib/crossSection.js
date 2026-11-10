// Scores that compare each stock with the rest of the universe:
// the calculated moat score (1-10) and the Magic Formula rank.

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Moat score, max 10:
//   Return on operating capital, 5-yr median 3  (>=25% = 3, 15-25% = 2, 10-15% = 1)
//   Track record                             2  (years above 15%: 5 = 2, 4 = 1, 3 = 0.5)
//   Gross margin level                       2  (>=60% = 2, 40-60% = 1.5, 25-40% = 1, 15-25% = 0.5)
//   Gross margin stability                   1  (std dev of 5 yearly margins: <=2pts = 1, <=4pts = 0.5)
//   Margin premium over industry peers       2  (operating margin >= 2x industry median = 2, above median = 1)
//   Loss years                              −1 each (operating loss in any of the last 5 years)
// Rounded to the nearest whole number, between 1 and 10.
// Fewer than 4 years of financials: no score (the owner sets one).
export function moatScore(m, ctx) {
  // New listings and young companies: too little history to judge from the numbers.
  const years = Math.max(m.roicYears?.length || 0, m.incomeYears || 0);
  if (years < 4) {
    return { score: null, raw: null, parts: [], reason: `Only ${years} year${years === 1 ? '' : 's'} of financials. Too little history to calculate a moat; set your own score.` };
  }
  const parts = [];
  const add = (label, pts, max, detail) => parts.push({ label, pts, max, detail });
  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
  const yr = (x) => (x >= 1 ? '>100%' : `${Math.round(x * 100)}%`);

  const r = m.roicMedian ?? m.roicAvg;
  add('Return on operating capital', r == null ? 0 : r >= 0.25 ? 3 : r >= 0.15 ? 2 : r >= 0.10 ? 1 : 0, 3,
    r == null ? 'n/a' : `median ${r >= 1 ? '>100%' : pct(r)}; yearly ${(m.roicYears || []).map(yr).join(', ')} (newest first)`);
  const n = m.roicYears?.length || 0;
  const above = m.roicYearsAbove15 ?? 0;
  const track = n < 3 ? 0 : above >= 5 ? 2 : above === 4 ? 1 : above === 3 ? 0.5 : 0;
  add('Track record', track, 2, `${above} of ${n} years above 15%`);
  const g = m.grossMarginAvg;
  add('Gross margin level', g == null ? 0 : g >= 0.6 ? 2 : g >= 0.4 ? 1.5 : g >= 0.25 ? 1 : g >= 0.15 ? 0.5 : 0, 2, pct(g));
  const sd = m.grossMarginStdev;
  add('Gross margin stability', sd == null || (m.grossMarginYears?.length || 0) < 3 ? 0 : sd <= 0.02 ? 1 : sd <= 0.04 ? 0.5 : 0, 1,
    sd == null ? 'n/a' : `moves ±${(sd * 100).toFixed(1)} pts a year`);
  const indMed = ctx.industryMedianOpMargin?.[m.industry];
  const om = m.operatingMargin;
  const premium = om == null || indMed == null || om <= 0 ? 0 : indMed > 0 && om >= 2 * indMed ? 2 : om > indMed ? 1 : 0;
  add('Margin premium over peers', premium, 2,
    `${pct(om)} operating margin vs ${pct(indMed)} median of ${ctx.industrySize?.[m.industry] ?? '?'} ${m.industry} stocks`);
  const losses = m.lossYears || 0;
  if (losses) add('Loss years', -losses, 0, `operating loss in ${losses} of the last ${m.incomeYears || 5} years`);

  const total = parts.reduce((s, p) => s + p.pts, 0);
  return { score: Math.min(10, Math.max(1, Math.round(total))), raw: total, parts };
}

// Context built once over the whole universe.
export function buildContext(all) {
  const byInd = {};
  for (const m of all) (byInd[m.industry || '—'] ||= []).push(m);
  const industryMedianOpMargin = {};
  const industryRevenueRank = {};
  const industrySize = {};
  for (const [ind, list] of Object.entries(byInd)) {
    industryMedianOpMargin[ind] = median(list.map((m) => m.operatingMargin));
    const sorted = list.filter((m) => m.revenueTtm ?? m.revenue).sort((a, b) => (b.revenueTtm ?? b.revenue) - (a.revenueTtm ?? a.revenue));
    sorted.forEach((m, i) => { industryRevenueRank[m.symbol] = i + 1; });
    industrySize[ind] = list.length;
  }
  return { industryMedianOpMargin, industryRevenueRank, industrySize };
}

// Greenblatt Magic Formula: rank by earnings yield (EBIT/EV) + rank by return on capital,
// lower combined = better. Financials and utilities are excluded, as in the original method.
export function magicFormulaRanks(all) {
  const ok = all.filter((m) => m.earningsYieldEbit != null && m.roicTtm != null && !/Financial|Utilities/.test(m.sector || ''));
  const eyRank = new Map([...ok].sort((a, b) => b.earningsYieldEbit - a.earningsYieldEbit).map((m, i) => [m.symbol, i + 1]));
  const rocRank = new Map([...ok].sort((a, b) => b.roicTtm - a.roicTtm).map((m, i) => [m.symbol, i + 1]));
  const combined = ok.map((m) => ({ s: m.symbol, v: eyRank.get(m.symbol) + rocRank.get(m.symbol) })).sort((a, b) => a.v - b.v);
  const out = {};
  combined.forEach((c, i) => { out[c.s] = { rank: i + 1, of: combined.length }; });
  return out;
}
