// Scores that compare each stock with the rest of the universe:
// the calculated moat score (1-8) and the Magic Formula rank.
import { roicOf } from './metrics.js';

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Moat score v3 (calculated max 8). A moat leaves fingerprints in the numbers: high returns on capital that hold up
// in bad years, prices and margins above the industry, and margins that don't erode.
// v4 (2026-11-13): up to 10 years of annual reports, stock-based pay added back to operating profit (moatInputs).
//   Return level        0–3   median return on operating capital: 8% → 0, 40%+ → 3 (straight line between)
//   Durability          0–2   weakest year after setting aside one bad year per five: 5% → 0, 20%+ → 2
//   Consistency         0–1   share of years with returns above 15%: 90%+ = 1, 70%+ = 0.5
//   Pricing power       0–2   gross margin vs its industry's median: at/above = 1, +10 pts = 1.5, +20 pts = 2
//   Margin premium      0–2   operating margin vs industry median: ≥2× = 2, ≥1.3× = 1, above = 0.5
//   Erosion            −2–0   gross margin down 5+ pts over the period = −1 (2.5+ = −0.5); operating margin
//                             down 5+ pts = −0.5; latest return under 60% of the earlier median = −0.5
//   Loss years                operating loss in the last 3 years = −1 each; older ones −0.5 each, at most −1
// Rounded to the nearest whole number, between 1 and 8. Calculated scores stop at 8 ("elite numbers"):
// 9-10 mean a near-irreplaceable position (ASML-type choke point), which the figures can't show; that comes
// from the written assessment (blendMoat, max 9) or the owner's own score (owner's scale, 2026-11-10: ASML 9+,
// LIN ~8, Visa/Mastercard 8+). v4 calibration (scratch moat10 run, 2026-11-13): wide-moat 7+ 37/56 (v3 30/56),
// no-moat 7+ 1/29 (v3 2/29); AXON 1→7, DDS 8→3, LIN 8→5 (2018 merger years), GEV stays 1 (spin-off).
// Fewer than 4 years of financials, or a bank/insurer (no gross margin to read): no score, the owner sets one.
// Calibrated against Morningstar's wide-moat list (VanEck MOAT holdings) and textbook no-moat industries:
// see scripts/moat-eval.mjs.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const half = (v) => Math.round(v * 2) / 2;
export const MOAT_CALC_MAX = 8;
export const MOAT_YEARS = 10;

// Final moat when a written assessment exists: 60% the judgement of the business (Morningstar's five sources),
// 40% the numbers. Capped at 9; a 10 only comes from the owner's own score. Without numbers (banks, new
// listings) the judgement stands alone.
export const MOAT_SOURCES = [
  ['intangibles', 'Brand, patents, licences'], ['switching', 'Switching costs'], ['network', 'Network effect'],
  ['cost', 'Cost advantage'], ['scale', 'One of very few players'],
];
export function blendMoat(calc, review) {
  if (!review) return calc ?? null;
  if (calc == null) return Math.min(9, review.rating);
  // 60% written judgement, 40% numbers; strong numbers can lift the written rating by at most 1 point
  // (they can't create a moat the business doesn't have), weak numbers can pull it down further.
  const blend = Math.round(0.6 * review.rating + 0.4 * calc);
  return Math.min(9, review.rating + 1, Math.max(1, blend));
}
// Moat inputs from annual reports (newest first, FMP field names; up to 10 years). Stock-based pay is added back
// to operating profit: it's a real cost to shareholders, but it doesn't say whether rivals can copy the business,
// and leaving it in made companies paid largely in stock (AXON, PLTR) look like loss-makers.
export function moatInputs(fy, years = MOAT_YEARS) {
  const rows = (fy || []).filter((r) => r.revenue > 0).slice(0, years);
  const sbc = (r) => Math.max(0, r.stockBasedCompensation || 0);
  const opAdj = (r) => ((r.operatingIncome ?? r.ebit) ?? 0) + sbc(r);
  const roicYears = rows.map((r) => roicOf({ ...r, ebit: r.ebit == null ? null : r.ebit + sbc(r) }, r)).filter((x) => x != null);
  const sorted = [...roicYears].sort((a, b) => a - b);
  return {
    roicYears, roicMedian: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null,
    incomeYears: rows.length,
    grossMarginYears: rows.map((r) => (r.grossProfit != null ? r.grossProfit / r.revenue : null)).filter((x) => x != null),
    opMarginYears: rows.map((r) => opAdj(r) / r.revenue),
    lossYears: rows.filter((r) => opAdj(r) < 0).length,
    sbcShare: rows[0] ? sbc(rows[0]) / rows[0].revenue : null,
    adjusted: rows.some((r) => sbc(r) > 0),
  };
}

const realGm = (x) => (x == null || x >= 0.995 ? null : x);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function moatScore(m, ctx) {
  const years = Math.max(m.roicYears?.length || 0, m.incomeYears || 0);
  if (years < 4) {
    return { score: null, raw: null, parts: [], reason: `Only ${years} year${years === 1 ? '' : 's'} of financials. Too little history to calculate a moat; set your own score.` };
  }
  if (/Banks|Insurance|Mortgage|REIT/.test(m.industry || '') || !(m.grossMarginYears?.length >= 3)) {
    return { score: null, raw: null, parts: [], reason: 'Banks, insurers and similar lenders don\'t report the margins this formula reads; set your own score.' };
  }
  const parts = [];
  const add = (label, pts, max, detail) => parts.push({ label, pts: half(pts), max, detail });
  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
  const yr = (x) => (x >= 1 ? '>100%' : `${Math.round(x * 100)}%`);
  const roic = m.roicYears || [];

  const med = m.roicMedian ?? m.roicAvg;
  add('Return on operating capital', med == null ? 0 : clamp(((med - 0.08) / 0.32) * 3, 0, 3), 3,
    med == null ? 'n/a' : `median ${med >= 1 ? '>100%' : pct(med)}; yearly ${roic.map(yr).join(', ')} (newest first)`);

  // Durability: a bad year is allowed per five (COVID, a recession); the next-worst year is what counts.
  const sorted = [...roic].sort((a, b) => a - b);
  const skip = Math.floor(sorted.length / 5);
  const weak = sorted.length ? sorted[Math.min(skip, sorted.length - 1)] : null;
  add('Durability', weak == null ? 0 : clamp(((weak - 0.05) / 0.15) * 2, 0, 2), 2,
    weak == null ? 'n/a' : `${skip ? `worst year${skip > 1 ? 's' : ''} set aside; ` : ''}weakest remaining year ${yr(weak)} (worst ${yr(sorted[0])})`);
  const above15 = roic.filter((x) => x > 0.15).length;
  const share15 = roic.length ? above15 / roic.length : 0;
  add('Consistency', share15 >= 0.9 ? 1 : share15 >= 0.7 ? 0.5 : 0, 1, `${above15} of ${roic.length} years above 15%`);

  // A gross margin of ~100% means the company reports no cost of revenue (Mastercard does this, Visa
  // doesn't), not that it has perfect pricing. Those get the neutral industry-level score.
  const gm = realGm(m.grossMargin ?? m.grossMarginYears?.[0]);
  const indGm = ctx.industryMedianGrossMargin?.[m.industry];
  const gap = gm != null && indGm != null ? gm - indGm : null;
  if (gm == null && indGm != null) add('Pricing power', 1, 2, 'no cost of revenue reported, so gross margin can\'t be compared; scored as industry level');
  else add('Pricing power', gap == null ? 0 : gap >= 0.20 ? 2 : gap >= 0.10 ? 1.5 : gap >= 0 ? 1 : 0, 2,
    `gross margin ${pct(gm)} vs ${pct(indGm)} industry median`);

  const indOm = ctx.industryMedianOpMargin?.[m.industry];
  const om = m.operatingMargin;
  const ratio = om > 0 && indOm > 0 ? om / indOm : null;
  add('Margin premium over peers', om == null || indOm == null || om <= 0 ? 0 : ratio >= 2 ? 2 : ratio >= 1.3 ? 1 : om > indOm ? 0.5 : 0, 2,
    `${pct(om)} operating margin vs ${pct(indOm)} median of ${ctx.industrySize?.[m.industry] ?? '?'} ${m.industry} stocks`);

  // Erosion: compare the oldest years with the newest (two each for 5 years of data, three for 6+).
  let erosion = 0; const why = [];
  const g = m.grossMarginYears || [], o = m.opMarginYears || [];
  if (g.length >= 4) {
    const k = g.length >= 6 ? 3 : 2;
    const drop = mean(g.slice(-k)) - mean(g.slice(0, k));
    if (drop >= 0.05) { erosion -= 1; why.push(`gross margin down ${(drop * 100).toFixed(1)} pts`); }
    else if (drop >= 0.025) { erosion -= 0.5; why.push(`gross margin down ${(drop * 100).toFixed(1)} pts`); }
  }
  if (o.length >= 4) {
    const k = o.length >= 6 ? 3 : 2;
    const drop = mean(o.slice(-k)) - mean(o.slice(0, k));
    if (drop >= 0.05) { erosion -= 0.5; why.push(`operating margin down ${(drop * 100).toFixed(1)} pts`); }
  }
  if (roic.length >= 4) {
    const older = [...roic.slice(1)].sort((a, b) => a - b)[Math.floor((roic.length - 2) / 2)];
    if (older > 0.1 && roic[0] < 0.6 * older) { erosion -= 0.5; why.push(`latest return ${yr(roic[0])} vs earlier ${yr(older)}`); }
  }
  add('Erosion', Math.max(-2, erosion), 0, why.length ? why.join('; ') : 'no erosion in margins or returns');

  const om5 = m.opMarginYears || [];
  const recent = om5.slice(0, 3).filter((x) => x < 0).length, older = om5.slice(3).filter((x) => x < 0).length;
  const olderPts = Math.min(1, older * 0.5);   // old losses count, but at most 1 point in total
  // Older stored data has only a loss-year count; use it until the stock is refreshed.
  if (!om5.length && m.lossYears) add('Loss years', -m.lossYears, 0, `operating loss in ${m.lossYears} of the last ${m.incomeYears || 5} years`);
  if (recent || older) add('Loss years', -(recent + olderPts), 0,
    `operating loss in ${recent} of the last 3 years${older ? ` and ${older} of the ${om5.length - 3} before` : ''}${m.adjusted ? ' (stock-based pay added back)' : ''}`);

  const total = parts.reduce((s, p) => s + p.pts, 0);
  // The numbers can show an elite business (8) but not whether it is irreplaceable; 9-10 are set by the owner.
  return { score: clamp(Math.round(total), 1, MOAT_CALC_MAX), raw: total, parts, capped: Math.round(total) > MOAT_CALC_MAX };
}

// Context built once over the whole universe: industry medians and revenue shares.
export function buildContext(all) {
  const byInd = {};
  for (const m of all) (byInd[m.industry || '—'] ||= []).push(m);
  const median = (xs) => {
    const v = xs.filter((x) => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    const k = Math.floor(v.length / 2);
    return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
  };
  const industryMedianOpMargin = {}, industryMedianGrossMargin = {}, industryShare = {}, industrySize = {};
  for (const [ind, list] of Object.entries(byInd)) {
    industryMedianOpMargin[ind] = median(list.map((m) => m.operatingMargin));
    industryMedianGrossMargin[ind] = median(list.map((m) => realGm(m.grossMargin)));
    const total = list.reduce((s, m) => s + (m.revenueTtm ?? m.revenue ?? 0), 0);
    for (const m of list) if (total > 0 && (m.revenueTtm ?? m.revenue)) industryShare[m.symbol] = (m.revenueTtm ?? m.revenue) / total;
    industrySize[ind] = list.length;
  }
  return { industryMedianOpMargin, industryMedianGrossMargin, industryShare, industrySize };
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
