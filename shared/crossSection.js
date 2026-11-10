// Scores that compare each stock with the rest of the universe:
// the calculated moat score (1-10) and the Magic Formula rank.

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Moat score v3, max 10. A moat leaves fingerprints in the numbers: high returns on capital that hold up
// in the worst year, prices that beat the industry, margins that don't erode, and a big share of the market.
//   Return level        0–3   median return on operating capital: 8% → 0, 40%+ → 3 (straight line between)
//   Durability          0–2   worst year of the last five: 5% → 0, 20%+ → 2
//   Pricing power       0–2   gross margin ≥50% = 1 (≥35% = 0.5) + premium over the industry's median: +20 pts → +1
//   Margin premium      0–2   operating margin vs industry median: ≥2× = 2, ≥1.3× = 1, above = 0.5
//   Market position     0–1   share of its industry's revenue (US-listed peers): ≥30% = 1, ≥15% = 0.5
//   Erosion            −2–0   gross margin down 5+ pts over the period = −1 (2.5+ = −0.5); operating margin
//                             down 5+ pts = −0.5; latest return under 60% of the earlier median = −0.5
//   Loss years          −1 each (operating loss in any of the last five years)
// Rounded to the nearest whole number, between 1 and 10.
// Fewer than 4 years of financials, or a bank/insurer (no gross margin to read): no score, the owner sets one.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const half = (v) => Math.round(v * 2) / 2;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function moatScore(m, ctx) {
  const years = Math.max(m.roicYears?.length || 0, m.incomeYears || 0);
  if (years < 4) {
    return { score: null, raw: null, parts: [], reason: `Only ${years} year${years === 1 ? '' : 's'} of financials. Too little history to calculate a moat; set your own score.` };
  }
  if (/Banks|Insurance|Financial - Credit|Mortgage|REIT/.test(m.industry || '') || !(m.grossMarginYears?.length >= 3)) {
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

  const worst = roic.length ? Math.min(...roic) : null;
  add('Durability (worst year)', worst == null ? 0 : clamp(((worst - 0.05) / 0.15) * 2, 0, 2), 2,
    worst == null ? 'n/a' : `lowest return in ${roic.length} years: ${yr(worst)}`);

  const gm = m.grossMargin ?? m.grossMarginYears?.[0];
  const indGm = ctx.industryMedianGrossMargin?.[m.industry];
  const gmLevel = gm >= 0.5 ? 1 : gm >= 0.35 ? 0.5 : 0;
  const gmPrem = gm != null && indGm != null ? clamp((gm - indGm) / 0.20, 0, 1) : 0;
  add('Pricing power', gmLevel + gmPrem, 2, `gross margin ${pct(gm)} vs ${pct(indGm)} industry median`);

  const indOm = ctx.industryMedianOpMargin?.[m.industry];
  const om = m.operatingMargin;
  const ratio = om > 0 && indOm > 0 ? om / indOm : null;
  add('Margin premium over peers', om == null || indOm == null || om <= 0 ? 0 : ratio >= 2 ? 2 : ratio >= 1.3 ? 1 : om > indOm ? 0.5 : 0, 2,
    `${pct(om)} operating margin vs ${pct(indOm)} median of ${ctx.industrySize?.[m.industry] ?? '?'} ${m.industry} stocks`);

  const share = ctx.industryShare?.[m.symbol];
  add('Market position', share >= 0.30 ? 1 : share >= 0.15 ? 0.5 : 0, 1,
    share == null ? 'n/a' : `${pct(share)} of US-listed ${m.industry} revenue`);

  // Erosion: compare the two oldest years with the two newest.
  let erosion = 0; const why = [];
  const g = m.grossMarginYears || [], o = m.opMarginYears || [];
  if (g.length >= 4) {
    const drop = mean(g.slice(-2)) - mean(g.slice(0, 2));
    if (drop >= 0.05) { erosion -= 1; why.push(`gross margin down ${(drop * 100).toFixed(1)} pts`); }
    else if (drop >= 0.025) { erosion -= 0.5; why.push(`gross margin down ${(drop * 100).toFixed(1)} pts`); }
  }
  if (o.length >= 4) {
    const drop = mean(o.slice(-2)) - mean(o.slice(0, 2));
    if (drop >= 0.05) { erosion -= 0.5; why.push(`operating margin down ${(drop * 100).toFixed(1)} pts`); }
  }
  if (roic.length >= 4) {
    const older = [...roic.slice(1)].sort((a, b) => a - b)[Math.floor((roic.length - 2) / 2)];
    if (older > 0.1 && roic[0] < 0.6 * older) { erosion -= 0.5; why.push(`latest return ${yr(roic[0])} vs earlier ${yr(older)}`); }
  }
  add('Erosion', Math.max(-2, erosion), 0, why.length ? why.join('; ') : 'no erosion in margins or returns');

  const losses = m.lossYears || 0;
  if (losses) add('Loss years', -losses, 0, `operating loss in ${losses} of the last ${m.incomeYears || 5} years`);

  const total = parts.reduce((s, p) => s + p.pts, 0);
  return { score: clamp(Math.round(total), 1, 10), raw: total, parts };
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
    industryMedianGrossMargin[ind] = median(list.map((m) => m.grossMargin));
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
