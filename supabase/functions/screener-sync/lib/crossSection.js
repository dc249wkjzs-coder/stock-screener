// Scores that compare each stock with the rest of the universe:
// the calculated moat score (1-8), the final moat (caps + written assessment) and the Magic Formula rank.
import { roicOf } from './metrics.js';

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Moat score v5 (2026-11-13, rebuilt to Jameson's spec "Moat score rebuild — implementation spec").
// Three layers:
//   1. Calculated score C (1–8) from up to 10 years of annual reports (moatScore below). Measures quality and market
//      position: what the numbers can show. Stock-based pay added back to profit. Banks/insurers/REITs and fewer than
//      5 years of history: no score.
//        Return on capital    0–3   median yearly return: ≤8% = 0, ≥40% = 3, linear
//        Durability           0–2   weakest year after ignoring one bad year in five: ≤5% = 0, ≥20% = 2, linear
//        Consistency          0–1   share of years with return >15%: ≥90% = 1, ≥70% = 0.5
//        Pricing power        0–2   gross margin vs industry median: ≥+20 pts = 2, ≥+10 = 1.5, ≥ median = 1, below = 0
//        Margin vs peers      0–2   operating margin vs industry median: ≥2× = 2, ≥1.3× = 1, just above = 0.5
//        Market position      0–2   share of its industry's revenue (FMP industry, US-listed universe): ≥30% = 2,
//                                    ≥15% = 1.5, ≥8% = 1; fallback market-cap share; neither = 0
//        Erosion             0 to −2 oldest 3-yr avg vs newest 3-yr avg of gross margin and of return: a fall of more
//                                    than 2 pts counts; both fall = −2, one = −1
//        Loss years                  −1 per loss year in the last 3; −0.5 per older loss year, older max −1
//        Customer concentration  −1  largest customer >20% of revenue (manual flag, applied in finalMoat)
//      Sum, round half up, clamp 1–8. Thresholds live in MOAT_DEFAULTS and can be tuned from scr_config (key 'moat').
//   2. Hard caps (finalMoat): structural facts the formula can't see, set per company in scr_moat_flags.
//   3. Written assessment W (1–9) + blend (finalMoat): F = min(round(0.6W + 0.4C), W + 1); no assessment → min(C, 6),
//      marked "unverified — numbers only". The owner's own score overrides everything.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;
const roundHalfUp = (v) => Math.floor(v + 0.5);
export const MOAT_CALC_MAX = 8;
export const MOAT_YEARS = 10;
export const MOAT_DEFAULTS = {
  minYears: 5,
  roic: [0.08, 0.40], dur: [0.05, 0.20], consBar: 0.15, cons: [0.9, 0.7],
  gm: [0.20, 0.10], om: [2, 1.3], pos: [0.30, 0.15, 0.08], erosionPts: 0.02,
};
export const MOAT_SOURCES = [
  ['intangibles', 'Brand, patents, licences'], ['switching', 'Switching costs'], ['network', 'Network effect'],
  ['cost', 'Cost advantage'], ['scale', 'One of very few players'],
];

// Layer 2: hard caps. Each flag is a structural fact set by hand (scr_moat_flags), reviewed yearly.
export const MOAT_CAPS = [
  { key: 'single_product', cap: 4, label: 'One product or segment is over 70% of revenue' },
  { key: 'patent_cliff', cap: 4, label: 'Key patent expires within 5 years, no replacement over 20% of revenue' },
  { key: 'mlm', cap: 4, label: 'Revenue depends on independent distributors / multi-level marketing' },
  { key: 'fashion', cap: 6, label: 'Demand driven by fashion or trend cycles' },
  { key: 'market_making', cap: 5, label: 'Main revenue is the bid-ask spread / market-making' },
  { key: 'fragmented', cap: 5, label: 'Fragmented market and no switching costs' },
  { key: 'big_customer', cap: 6, label: 'Largest customer is over 20% of revenue' },
];
export const MOAT_UNVERIFIED_MAX = 6;

// Layers 2 and 3 together. parts = the calculated parts (card.moatParts); flags = scr_moat_flags row; review =
// scr_moat_review row; override = the owner's own score. Returns everything the site shows.
export function finalMoat({ parts, review = null, flags = null, override = null }) {
  const has = (k) => !!flags?.[k];
  let calc = null, calcRaw = null, calcBeforeCaps = null;
  const caps = [];
  if (parts?.length) {
    calcRaw = parts.reduce((s, p) => s + (p.pts || 0), 0) - (has('big_customer') ? 1 : 0);
    calcBeforeCaps = clamp(roundHalfUp(calcRaw), 1, MOAT_CALC_MAX);
    calc = calcBeforeCaps;
    for (const c of MOAT_CAPS) if (has(c.key)) { caps.push(c); calc = Math.min(calc, c.cap); }
  }
  const W = review?.rating ?? null;
  let final, unverified = false;
  if (W != null) final = calc == null ? Math.min(9, W) : Math.min(9, W + 1, Math.max(1, roundHalfUp(0.6 * W + 0.4 * calc)));
  else if (calc != null) { final = Math.min(calc, MOAT_UNVERIFIED_MAX); unverified = true; }
  else final = null;
  const lowestCap = caps.length ? Math.min(...caps.map((c) => c.cap)) : null;
  return {
    final: override ?? final, written: W, calc, calcBeforeCaps, calcRaw, caps, unverified: override == null && unverified,
    // A structural cap below the written rating is a contradiction a person should look at; the written score is never auto-capped.
    needsReview: W != null && lowestCap != null && W > lowestCap,
    concentration: has('big_customer'), override,
  };
}

// Moat inputs from annual reports (newest first, FMP field names; up to 10 years). Stock-based pay is added back
// to operating profit: it's a real cost to shareholders, but it doesn't say whether rivals can copy the business.
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

export function moatScore(m, ctx, opt = MOAT_DEFAULTS) {
  const O = { ...MOAT_DEFAULTS, ...opt };
  const years = Math.max(m.roicYears?.length || 0, m.incomeYears || 0);
  if (years < O.minYears) {
    return { score: null, raw: null, parts: [], reason: `Only ${years} year${years === 1 ? '' : 's'} of financials (needs ${O.minYears}). Too little history to calculate a moat.` };
  }
  if (/Banks|Insurance|Mortgage|REIT/.test(m.industry || '') || !(m.grossMarginYears?.length >= 3)) {
    return { score: null, raw: null, parts: [], reason: 'Banks, insurers and similar lenders don\'t report the margins this formula reads.' };
  }
  const parts = [];
  const add = (key, label, pts, max, detail) => parts.push({ key, label, pts: r1(pts), max, detail });
  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
  const yr = (x) => (x >= 1 ? '>100%' : `${Math.round(x * 100)}%`);
  const roic = m.roicYears || [];
  const lin = (v, [lo, hi], max) => clamp(((v - lo) / (hi - lo)) * max, 0, max);

  const med = m.roicMedian ?? m.roicAvg;
  add('return', 'Return on capital', med == null ? 0 : lin(med, O.roic, 3), 3,
    med == null ? 'n/a' : `median ${med >= 1 ? '>100%' : pct(med)}; yearly ${roic.map(yr).join(', ')} (newest first)`);

  const sorted = [...roic].sort((a, b) => a - b);
  const skip = Math.floor(sorted.length / 5);
  const weak = sorted.length ? sorted[Math.min(skip, sorted.length - 1)] : null;
  add('durability', 'Durability', weak == null ? 0 : lin(weak, O.dur, 2), 2,
    weak == null ? 'n/a' : `${skip ? `worst year${skip > 1 ? 's' : ''} set aside; ` : ''}weakest remaining year ${yr(weak)} (worst ${yr(sorted[0])})`);

  const above = roic.filter((x) => x > O.consBar).length;
  const share = roic.length ? above / roic.length : 0;
  add('consistency', 'Consistency', share >= O.cons[0] ? 1 : share >= O.cons[1] ? 0.5 : 0, 1, `${above} of ${roic.length} years above ${Math.round(O.consBar * 100)}%`);

  // A gross margin of ~100% means no cost of revenue is reported (Mastercard), not perfect pricing: industry level.
  const gm = realGm(m.grossMargin ?? m.grossMarginYears?.[0]);
  const indGm = ctx.industryMedianGrossMargin?.[m.industry];
  const gap = gm != null && indGm != null ? gm - indGm : null;
  if (gm == null && indGm != null) add('pricing', 'Pricing power', 1, 2, 'no cost of revenue reported, so gross margin can\'t be compared; scored as industry level');
  else add('pricing', 'Pricing power', gap == null ? 0 : gap >= O.gm[0] ? 2 : gap >= O.gm[1] ? 1.5 : gap >= 0 ? 1 : 0, 2, `gross margin ${pct(gm)} vs ${pct(indGm)} industry median`);

  const indOm = ctx.industryMedianOpMargin?.[m.industry];
  const om = m.operatingMargin;
  const ratio = om > 0 && indOm > 0 ? om / indOm : null;
  add('margin', 'Margin vs peers', om == null || indOm == null || om <= 0 ? 0 : ratio >= O.om[0] ? 2 : ratio >= O.om[1] ? 1 : om > indOm ? 0.5 : 0, 2,
    `${pct(om)} operating margin vs ${pct(indOm)} median of ${ctx.industrySize?.[m.industry] ?? '?'} ${m.industry} stocks`);

  // Market position: share of its industry's revenue among US-listed companies above $500M (fallback: market value).
  const revShare = ctx.industryShare?.[m.symbol], capShare = ctx.industryCapShare?.[m.symbol];
  const sh = revShare ?? capShare;
  add('position', 'Market position', sh == null ? 0 : sh >= O.pos[0] ? 2 : sh >= O.pos[1] ? 1.5 : sh >= O.pos[2] ? 1 : 0, 2,
    sh == null ? 'no revenue or market value to compare' : `${pct(sh)} of ${m.industry} ${revShare != null ? 'revenue' : 'market value'} (${ctx.industrySize?.[m.industry] ?? '?'} companies)`);

  // Erosion: oldest 3 years vs newest 3 years, gross margin and return on capital; a fall of more than 2 points counts.
  const g = m.grossMarginYears || [];
  const fall = (xs) => (xs.length >= 4 ? mean(xs.slice(-3)) - mean(xs.slice(0, 3)) : null);
  const gFall = fall(g), rFall = fall(roic);
  const gDown = gFall != null && gFall > O.erosionPts, rDown = rFall != null && rFall > O.erosionPts;
  const why = [];
  if (gDown) why.push(`gross margin down ${(gFall * 100).toFixed(1)} pts`);
  if (rDown) why.push(`return on capital down ${(rFall * 100).toFixed(1)} pts`);
  add('erosion', 'Erosion', (gDown ? -1 : 0) + (rDown ? -1 : 0) || 0, 0, why.length ? `${why.join('; ')} (oldest 3 years vs newest 3)` : 'margins and returns not falling');

  const om5 = m.opMarginYears || [];
  const recent = om5.slice(0, 3).filter((x) => x < 0).length, older = om5.slice(3).filter((x) => x < 0).length;
  const lossPts = om5.length ? recent + Math.min(1, older * 0.5) : m.lossYears || 0;
  if (lossPts) add('losses', 'Loss years', -lossPts, 0,
    om5.length ? `operating loss in ${recent} of the last 3 years${older ? ` and ${older} of the ${om5.length - 3} before` : ''}${m.adjusted ? ' (stock-based pay added back)' : ''}`
      : `operating loss in ${m.lossYears} of the last ${m.incomeYears || 5} years`);

  const total = parts.reduce((s, p) => s + p.pts, 0);
  return { score: clamp(roundHalfUp(total), 1, MOAT_CALC_MAX), raw: r1(total), parts };
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
  const industryMedianOpMargin = {}, industryMedianGrossMargin = {}, industryShare = {}, industryCapShare = {}, industrySize = {};
  for (const [ind, list] of Object.entries(byInd)) {
    industryMedianOpMargin[ind] = median(list.map((m) => m.operatingMargin));
    industryMedianGrossMargin[ind] = median(list.map((m) => realGm(m.grossMargin)));
    const total = list.reduce((s, m) => s + (m.revenueTtm ?? m.revenue ?? 0), 0);
    for (const m of list) if (total > 0 && (m.revenueTtm ?? m.revenue)) industryShare[m.symbol] = (m.revenueTtm ?? m.revenue) / total;
    const capTotal = list.reduce((s, m) => s + (m.marketCap || 0), 0);
    for (const m of list) if (capTotal > 0 && m.marketCap) industryCapShare[m.symbol] = m.marketCap / capTotal;
    industrySize[ind] = list.length;
  }
  return { industryMedianOpMargin, industryMedianGrossMargin, industryShare, industryCapShare, industrySize };
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
