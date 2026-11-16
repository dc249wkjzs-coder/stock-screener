// Prospects: scans every stock in every sector for opportunities = a sound business trading at a discount,
// then ranks them. Fixed rules on the site's own numbers; a list to research, not advice.
//
// Qualifies when ALL hold:
//   profitable (no GAAP loss), moat 5+, net debt / EBITDA ≤ 4x (net cash passes), not a "Sell" call,
//   and at least one sign of a discount: price ≥10% below the fair value middle, forward P/E ≥15% below its
//   industry median, or trailing P/E ≥20% below its own 5-year average.
// Score 0–100 = discount 35 + quality 30 + timing 20 + growth 15, each a rank among the qualifying stocks
// (timing from the Fibonacci entry status).
import { rankWithin } from './picks.js';
import { compare } from './peers.js';
import { verdict } from './valuation.js';

export const PROSPECT_RULES = { moatMin: 5, debtMax: 4, fairDiscount: -0.10, industryPeDiscount: -0.15, ownPeDiscount: -0.20 };
export const PROSPECT_WEIGHTS = { discount: 0.35, quality: 0.30, timing: 0.20, growth: 0.15 };
const ENTRY = { 'zone-confirmed': 1, zone: 0.8, wait: 0.5, extended: 0.2, below: 0.3 };
const MISSING = 0.4;
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;

function signals(s, peers) {
  const R = PROSPECT_RULES;
  const pe = peers ? compare(s, 'forwardPE', peers) : null;
  const vsIndustry = pe?.valid && pe.group?.median ? s.forwardPE / pe.group.median - 1 : null;
  const out = [];
  if (s.fair?.vsMid != null && s.fair.vsMid <= R.fairDiscount) out.push({ key: 'fair', v: s.fair.vsMid, text: `${pct(s.fair.vsMid)} below fair value` });
  if (vsIndustry != null && vsIndustry <= R.industryPeDiscount) out.push({ key: 'industryPe', v: vsIndustry, text: `forward P/E ${s.forwardPE.toFixed(1)}x vs ${pe.group.median.toFixed(1)}x ${pe.group.label}` });
  if (s.peVs5y != null && s.peTtm > 0 && s.peVs5y <= R.ownPeDiscount) out.push({ key: 'ownPe', v: s.peVs5y, text: `P/E ${pct(s.peVs5y)} below its 5-yr average` });
  return { list: out, vsIndustry };
}

export function qualifies(s, peers) {
  const R = PROSPECT_RULES;
  if (!s?.price || s.gaapLossTtm !== false) return { ok: false, why: 'not profitable (or no data)' };
  if (!(s.moatUsed >= R.moatMin)) return { ok: false, why: `moat below ${R.moatMin}` };
  if (s.netDebtToEbitda != null && s.netDebtToEbitda > R.debtMax) return { ok: false, why: `debt above ${R.debtMax}x EBITDA` };
  const call = verdict(s);
  if (call.call === 'sell') return { ok: false, why: 'Sell call (30%+ above fair value)' };
  const sig = signals(s, peers);
  if (!sig.list.length) return { ok: false, why: 'no sign of a discount' };
  return { ok: true, call, sig };
}

export function prospects(stocks, peers) {
  const Q = [];
  for (const s of stocks) { const q = qualifies(s, peers); if (q.ok) Q.push({ s, ...q }); }
  const S = Q.map((q) => ({ ...q.s, _vsInd: q.sig.vsIndustry }));
  const r = {
    fair: rankWithin(S, (s) => s.fair?.vsMid ?? null, true),
    ind: rankWithin(S, (s) => s._vsInd, true),
    own: rankWithin(S, (s) => (s.peTtm > 0 ? s.peVs5y : null), true),
    moat: rankWithin(S, (s) => s.moatUsed),
    margin: rankWithin(S, (s) => s.ebitdaMargin),
    debt: rankWithin(S, (s) => (s.netDebtToEbitda == null ? null : Math.max(-1, s.netDebtToEbitda)), true),
    eps: rankWithin(S, (s) => s.epsGrowth),
    sales: rankWithin(S, (s) => s.revenueGrowth),
  };
  const list = Q.map(({ s, call, sig }) => {
    const k = (n) => r[n][s.symbol] ?? null;
    const parts = {
      discount: avg([k('fair'), k('ind'), k('own')]),
      quality: avg([k('moat'), k('margin'), k('debt')]),
      timing: ENTRY[s.setup?.status] ?? null,
      growth: avg([k('eps'), k('sales')]),
    };
    const score = Math.round(100 * Object.entries(PROSPECT_WEIGHTS).reduce((t, [g, w]) => t + w * (parts[g] ?? MISSING), 0));
    const reasons = [
      ...sig.list.map((x) => x.text),
      `moat ${s.moatUsed}/10`,
      s.epsGrowth != null ? `EPS growth ${Math.round(s.epsGrowth * 100)}%/yr` : null,
      s.netDebtToEbitda != null && s.netDebtToEbitda < 0 ? 'net cash' : null,
      s.setup?.status === 'zone-confirmed' ? 'in a buy zone, turning up' : s.setup?.status === 'zone' ? 'in a buy zone' : null,
    ].filter(Boolean);
    return { symbol: s.symbol, name: s.name, sector: s.sector || 'Other', industry: s.industry, price: s.price, call: call.call, score, parts, reasons };
  }).sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  list.forEach((p, i) => { p.rank = i + 1; });
  // Every sector in the universe, with how many stocks were scanned and how many qualified.
  const sectors = {};
  for (const s of stocks) { const k = s.sector || 'Other'; (sectors[k] ||= { sector: k, scanned: 0, picks: [] }).scanned++; }
  for (const p of list) sectors[p.sector].picks.push(p);
  return { list, sectors: Object.values(sectors).sort((a, b) => (b.picks[0]?.score ?? -1) - (a.picks[0]?.score ?? -1)), scanned: stocks.length };
}
