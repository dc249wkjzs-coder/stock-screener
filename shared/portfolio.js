// "My portfolio": scores a hand-picked collection of stocks against the whole market and lists its strengths
// and weaknesses. Every line is a figure compared with a fixed threshold or with the market median.
import { rankWithin } from './picks.js';
import { riskProfile } from './criteria.js';

const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const median = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const debtOf = (s) => (s.netDebtToEbitda == null ? null : Math.max(-1, s.netDebtToEbitda));

// Weights in %: the ones you set, the rest share what's left equally; then scaled to add up to 100.
export function resolveWeights(items) {
  const set = items.filter((i) => i.weight != null);
  const free = items.length - set.length;
  const setSum = set.reduce((a, i) => a + Number(i.weight), 0);
  const each = free ? Math.max(0, 100 - setSum) / free : 0;
  const raw = items.map((i) => (i.weight != null ? Number(i.weight) : each));
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(items.map((i, k) => [i.symbol, total > 0 ? raw[k] / total : 1 / items.length]));
}

export const PORTFOLIO_WEIGHTS = { quality: 0.3, growth: 0.2, value: 0.2, strength: 0.1, diversification: 0.2 };
export const PORTFOLIO_LABELS = { quality: 'Quality', growth: 'Growth', value: 'Value', strength: 'Balance sheet', diversification: 'Diversification' };

export function scorePortfolio(items, universe) {
  const bySym = Object.fromEntries(universe.map((s) => [s.symbol, s]));
  const held = items.filter((i) => bySym[i.symbol]);
  if (!held.length) return null;
  const w = resolveWeights(held);
  const H = held.map((i) => ({ s: bySym[i.symbol], w: w[i.symbol], weightSet: i.weight != null }));

  // Each holding ranked against every stock in the screener (1 = best in the market).
  const R = {
    moat: rankWithin(universe, (s) => s.moatUsed),
    eps: rankWithin(universe, (s) => s.epsGrowth),
    sales: rankWithin(universe, (s) => s.revenueGrowth),
    peg: rankWithin(universe, (s) => (s.peg > 0 ? s.peg : null), true),
    fair: rankWithin(universe, (s) => s.fair?.vsMid ?? null, true),
    fcf: rankWithin(universe, (s) => s.fcfYield),
    debt: rankWithin(universe, debtOf, true),
  };
  const groupOf = (s) => ({
    quality: R.moat[s.symbol] ?? null,
    growth: avg([R.eps[s.symbol], R.sales[s.symbol]]),
    value: avg([R.peg[s.symbol], R.fair[s.symbol], R.fcf[s.symbol]]),
    strength: s.gaapLossTtm ? 0 : R.debt[s.symbol] ?? null,
  });
  // Weighted average over the holdings that have the figure.
  const wavg = (get) => {
    let t = 0, ww = 0;
    for (const h of H) { const v = get(h.s); if (v != null && Number.isFinite(v)) { t += v * h.w; ww += h.w; } }
    return ww > 0 ? t / ww : null;
  };
  const wshare = (pred) => H.reduce((a, h) => a + (pred(h.s) ? h.w : 0), 0);

  // Diversification: effective number of holdings (1 / sum of squared weights) and the largest sector.
  const effective = 1 / H.reduce((a, h) => a + h.w * h.w, 0);
  const sectors = {};
  for (const h of H) sectors[h.s.sector || 'Unknown'] = (sectors[h.s.sector || 'Unknown'] || 0) + h.w;
  const sectorList = Object.entries(sectors).map(([name, share]) => ({ name, share })).sort((a, b) => b.share - a.share);
  const topSector = sectorList[0];
  const biggest = [...H].sort((a, b) => b.w - a.w)[0];
  const countPts = Math.min(1, Math.max(0, (effective - 1) / 11));            // 1 stock = 0, 12+ equal = 1
  const sectorPts = Math.min(1, Math.max(0, (1 - topSector.share) / 0.7));    // one sector = 0, largest ≤30% = 1
  const diversification = 0.5 * countPts + 0.5 * sectorPts;

  const scores = {
    quality: wavg((s) => groupOf(s).quality),
    growth: wavg((s) => groupOf(s).growth),
    value: wavg((s) => groupOf(s).value),
    strength: wavg((s) => groupOf(s).strength),
    diversification,
  };
  const overall = Object.entries(PORTFOLIO_WEIGHTS).reduce((t, [k, wt]) => t + wt * (scores[k] ?? 0.4), 0);

  // Figures for the strengths and weaknesses, with the market median beside each.
  const mkt = (get) => median(universe.map(get));
  const F = {
    moat: wavg((s) => s.moatUsed), moatMkt: mkt((s) => s.moatUsed),
    eps: wavg((s) => s.epsGrowth), epsMkt: mkt((s) => s.epsGrowth),
    sales: wavg((s) => s.revenueGrowth), salesMkt: mkt((s) => s.revenueGrowth),
    pe: wavg((s) => (s.forwardPE > 0 ? s.forwardPE : null)), peMkt: mkt((s) => (s.forwardPE > 0 ? s.forwardPE : null)),
    peg: wavg((s) => (s.peg > 0 ? s.peg : null)),
    fcf: wavg((s) => s.fcfYield), fcfMkt: mkt((s) => s.fcfYield),
    beta: wavg((s) => s.beta),
    drop: wavg((s) => s.pullbackMax),
    margin: wavg((s) => s.ebitdaMargin), marginMkt: mkt((s) => s.ebitdaMargin),
    div: wavg((s) => s.dividendYield ?? 0),
    ai: wavg((s) => s.aiRisk), aiBenefit: wavg((s) => s.aiBenefit),
    losses: wshare((s) => s.gaapLossTtm), highDebt: wshare((s) => s.netDebtToEbitda > 3), netCash: wshare((s) => s.netDebtToEbitda != null && s.netDebtToEbitda < 0),
    inZone: H.filter((h) => /zone/.test(h.s.setup?.status || '')).map((h) => h.s.symbol),
    extended: H.filter((h) => h.s.setup?.status === 'extended').map((h) => h.s.symbol),
    noAi: H.filter((h) => h.s.aiRisk == null).length,
  };

  const strengths = [], weaknesses = [];
  const add = (list, area, text) => list.push({ area, text });
  const sc = (x) => Math.round(x * 100);
  if (scores.quality != null) {
    if (scores.quality >= 0.7) add(strengths, 'Quality', `Strong businesses: average moat ${F.moat?.toFixed(1)} vs ${F.moatMkt} for the median stock (better than ${sc(scores.quality)}% of the market).`);
    else if (scores.quality < 0.45) add(weaknesses, 'Quality', `Moats are ordinary: average moat ${F.moat?.toFixed(1)} vs ${F.moatMkt} for the median stock.`);
  }
  if (F.margin != null && F.marginMkt != null && F.margin >= F.marginMkt * 1.5) add(strengths, 'Quality', `High profit margins: EBITDA margin ${pct(F.margin)} vs ${pct(F.marginMkt)} market median.`);
  if (scores.growth != null) {
    if (scores.growth >= 0.7) add(strengths, 'Growth', `Fast growers: expected EPS growth ${pct(F.eps)} a year and sales growth ${pct(F.sales)} (market medians ${pct(F.epsMkt)} and ${pct(F.salesMkt)}).`);
    else if (scores.growth < 0.4) add(weaknesses, 'Growth', `Slow growth: expected EPS growth ${pct(F.eps)} a year vs ${pct(F.epsMkt)} market median.`);
  }
  if (scores.value != null) {
    if (scores.value >= 0.6) add(strengths, 'Value', `Reasonably priced: forward P/E ${F.pe?.toFixed(1)} (market median ${F.peMkt?.toFixed(1)})${F.peg != null ? `, PEG ${F.peg.toFixed(2)}` : ''}.`);
    else if (scores.value < 0.35) add(weaknesses, 'Value', `Expensive: forward P/E ${F.pe?.toFixed(1)} vs ${F.peMkt?.toFixed(1)} market median${F.peg != null ? `, PEG ${F.peg.toFixed(2)}` : ''}. High expectations are priced in.`);
  }
  if (F.fcf != null && F.fcfMkt != null && F.fcf < 0.02) add(weaknesses, 'Value', `Low free cash flow yield: ${pct(F.fcf, 1)} vs ${pct(F.fcfMkt, 1)} market median.`);
  if (F.losses > 0.15) add(weaknesses, 'Balance sheet', `${pct(F.losses)} of the portfolio is in companies that lost money over the last 12 months.`);
  if (F.highDebt > 0.2) add(weaknesses, 'Balance sheet', `${pct(F.highDebt)} of the portfolio is in companies with debt above 3x EBITDA.`);
  if (F.netCash >= 0.4 && F.losses <= 0.1) add(strengths, 'Balance sheet', `${pct(F.netCash)} of the portfolio is in companies with more cash than debt.`);
  if (H.length < 5) add(weaknesses, 'Diversification', `Only ${H.length} stock${H.length === 1 ? '' : 's'}: one bad result moves the whole portfolio.`);
  else if (effective >= 10 && topSector.share <= 0.35) add(strengths, 'Diversification', `Well spread: ${H.length} stocks, largest sector ${topSector.name} at ${pct(topSector.share)}.`);
  if (topSector.share > 0.4 && H.length > 1) add(weaknesses, 'Diversification', `${pct(topSector.share)} in one sector (${topSector.name}): a slump in that sector hits most of the portfolio.`);
  if (biggest.w > 0.25 && H.length > 1) add(weaknesses, 'Diversification', `${biggest.s.symbol} is ${pct(biggest.w)} of the portfolio on its own.`);
  if (F.beta != null) {
    if (F.beta >= 1.3) add(weaknesses, 'Risk', `Swings more than the market: average beta ${F.beta.toFixed(2)} (market = 1.00), so a 10% market fall has meant about ${(F.beta * 10).toFixed(0)}% here.`);
    else if (F.beta <= 0.9) add(strengths, 'Risk', `Steadier than the market: average beta ${F.beta.toFixed(2)} (market = 1.00).`);
  }
  if (F.drop != null && F.drop <= -0.4) add(weaknesses, 'Risk', `Deep past drops: the average holding fell ${pct(-F.drop)} at its worst in the last ~2 years.`);
  if (F.ai != null) {
    if (F.ai >= 6) add(weaknesses, 'AI', `High AI disruption risk: average ${F.ai.toFixed(1)}/10${F.noAi ? ` (${F.noAi} not rated)` : ''}.`);
    else if (F.ai <= 3 && F.aiBenefit >= 6) add(strengths, 'AI', `Low AI disruption risk (${F.ai.toFixed(1)}/10) and high AI benefit (${F.aiBenefit.toFixed(1)}/10).`);
  }
  if (F.div >= 0.02) add(strengths, 'Income', `Pays a ${pct(F.div, 1)} average dividend.`);
  if (F.inZone.length) add(strengths, 'Entry timing', `At a buy level now: ${F.inZone.join(', ')}.`);
  if (F.extended.length >= Math.max(2, H.length / 2)) add(weaknesses, 'Entry timing', `Near their highs (extended): ${F.extended.join(', ')}. Buying all now means paying top-of-range prices.`);

  return { n: H.length, weights: w, effective, sectors: sectorList, scores, overall, strengths, weaknesses, figures: F, risk: riskProfile(H.map((h) => h.s)) };
}
