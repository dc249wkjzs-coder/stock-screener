// Fair value range, downside reference levels and the entry status for one stock.
// Everything here is a mechanical reading of the data and the mandate rules, not a forecast.
import { DEFAULT_RULES } from './pillars.js';

const ok = (v) => v != null && Number.isFinite(v) && v > 0;
const median = (xs) => { const v = [...xs].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// Up to four independent estimates of what the stock is worth per share.
export function fairValue(s, rules = DEFAULT_RULES) {
  const R = { ...DEFAULT_RULES, ...rules };
  const methods = [];
  if (ok(s.dcf)) methods.push({ key: 'dcf', label: 'Discounted cash flow (FMP)', value: s.dcf, how: 'FMP\'s DCF model' });
  if (ok(s.ntmEps) && ok(s.pe5yAvg)) {
    methods.push({ key: 'histPE', label: 'Own 5-year average P/E', value: s.ntmEps * s.pe5yAvg,
      how: `next-12-month EPS $${s.ntmEps.toFixed(2)} × ${s.pe5yAvg.toFixed(1)}x` });
  }
  if (ok(s.ntmEps) && ok(s.epsGrowth)) {
    // The highest P/E the value pillar passes outright: PEG at the pass line × growth in %, capped.
    const pe = Math.min(R.pegPass * s.epsGrowth * 100, R.fairPECap);
    methods.push({ key: 'pegPE', label: `P/E at PEG ${R.pegPass} for its growth`, value: s.ntmEps * pe,
      how: `$${s.ntmEps.toFixed(2)} × ${pe.toFixed(1)}x (${R.pegPass} × ${(s.epsGrowth * 100).toFixed(1)}% growth${pe === R.fairPECap ? ', capped' : ''})` });
  }
  if (ok(s.targetConsensus)) {
    methods.push({ key: 'analyst', label: 'Analysts\' 12-month target', value: s.targetConsensus,
      how: ok(s.targetLow) && ok(s.targetHigh) ? `consensus; range $${s.targetLow.toFixed(0)}–$${s.targetHigh.toFixed(0)}` : 'consensus' });
  }
  if (!methods.length) return null;
  const vals = methods.map((m) => m.value);
  const mid = median(vals);
  return {
    methods, low: Math.min(...vals), mid, high: Math.max(...vals),
    vsMid: s.price ? s.price / mid - 1 : null,               // −0.18 = price is 18% below the middle
    upsideToMid: s.price ? mid / s.price - 1 : null,
  };
}

// Where the data says support sits below the price, and how far this stock has fallen before.
export function downside(s) {
  const p = s.price;
  if (!p) return null;
  const rows = [];
  const levels = (s.fib?.levels || []).filter((l) => l.price < p);
  for (const l of levels) rows.push({ label: `Fibonacci ${(l.ratio * 100).toFixed(l.ratio === 1 ? 0 : 1)}%${l.ratio === 1 ? ' (swing low)' : ''}`, price: l.price, pct: l.price / p - 1 });
  if (ok(s.sma200) && s.sma200 < p) rows.push({ label: '200-day average', price: s.sma200, pct: s.sma200 / p - 1 });
  if (ok(s.low52) && s.low52 < p) rows.push({ label: '52-week low', price: s.low52, pct: s.low52 / p - 1 });
  rows.sort((a, b) => b.price - a.price);
  const hi = s.high52;
  return {
    rows,
    // If this pullback became as deep as the stock's typical / deepest one (measured from the 52-week high).
    typicalFloor: ok(hi) && s.pullbackMedian != null ? { price: hi * (1 + s.pullbackMedian), pct: (hi * (1 + s.pullbackMedian)) / p - 1, depth: s.pullbackMedian } : null,
    worstFloor: ok(hi) && s.pullbackMax != null ? { price: hi * (1 + s.pullbackMax), pct: (hi * (1 + s.pullbackMax)) / p - 1, depth: s.pullbackMax } : null,
    crash: s.beta > 0 ? Math.max(-0.95, -0.25 * s.beta) : null,
  };
}

// Status, in order: mandate verdict → position against the Fibonacci levels → bounce confirmation.
//   fail | incomplete | extended | wait | zone | zone-confirmed | below
// Buy ladder = Fibonacci levels from 38.2% down to the swing low, at or below (price + zone).
export function entrySetup(s, e, rules = DEFAULT_RULES, guide = null) {
  const R = { ...DEFAULT_RULES, ...rules };
  const p = s.price, f = s.fib;
  const base = { ladder: [], zoneLevel: null, confirmed: false, checks: [] };
  if (e.overall === 'fail') return { ...base, status: 'fail', title: 'Fails mandate', detail: e.pillars[e.firstFail].why };
  if (e.overall === 'incomplete') return { ...base, status: 'incomplete', title: 'Data incomplete', detail: `Missing: ${e.missing.join(', ')}` };
  if (!f || !p) return { ...base, status: 'incomplete', title: 'No price history yet', detail: 'Fibonacci levels need price history.' };

  const entryLevels = f.levels.filter((l) => l.ratio >= R.ladderMinRatio);
  const z = R.buyZonePct;
  // In the zone: within ±z of a level.
  const zoneLevel = entryLevels.find((l) => Math.abs(p / l.price - 1) <= z) || null;
  // Bounce confirmation: close back above the 20-day average and RSI back above 30.
  const aboveMa20 = s.sma20 != null && p > s.sma20;
  const rsiOk = s.rsi14 != null && s.rsi14 > R.confirmRsi;
  const checks = [
    { label: `Close above the 20-day average${s.sma20 ? ` ($${s.sma20.toFixed(2)})` : ''}`, ok: aboveMa20 },
    { label: `RSI above ${R.confirmRsi} (now ${s.rsi14 != null ? s.rsi14.toFixed(0) : 'n/a'})`, ok: rsiOk },
  ];
  const confirmed = aboveMa20 && rsiOk;
  // Ladder: levels at or below the top of the zone, deepest last; guide split equally.
  const rungs = entryLevels.filter((l) => l.price <= p * (1 + z)).slice(0, R.ladderRungs);
  const ladder = rungs.map((l) => ({ ...l, pct: l.price / p - 1, amount: guide ? guide / rungs.length : null }));

  let status, title, detail;
  if (f.belowSwing) { status = 'below'; title = 'Below every Fibonacci level'; detail = `The price is under the swing low ($${f.swingLow.price.toFixed(2)}); no Fibonacci support below.`; }
  else if (zoneLevel) {
    status = confirmed ? 'zone-confirmed' : 'zone';
    title = confirmed ? 'In buy zone · bounce confirmed' : 'In buy zone · not confirmed yet';
    detail = `${p > zoneLevel.price ? 'Within' : 'Just under'} ${(Math.abs(p / zoneLevel.price - 1) * 100).toFixed(1)}% of the ${(zoneLevel.ratio * 100).toFixed(1)}% level ($${zoneLevel.price.toFixed(2)}).`;
  } else {
    const next = entryLevels.filter((l) => l.price < p).sort((a, b) => b.price - a.price)[0];
    if (next && f.retraced < R.extendedRetrace) { status = 'extended'; title = 'Extended, near the high'; detail = `Only ${(f.retraced * 100).toFixed(0)}% off the swing high. First entry level: ${(next.ratio * 100).toFixed(1)}% at $${next.price.toFixed(2)} (${((next.price / p - 1) * 100).toFixed(1)}%).`; }
    else if (next) { status = 'wait'; title = `Wait for $${next.price.toFixed(2)}`; detail = `Next entry level is ${(next.ratio * 100).toFixed(1)}%, ${((next.price / p - 1) * 100).toFixed(1)}% below the price.`; }
    else { status = 'below'; title = 'Below every Fibonacci level'; detail = 'No Fibonacci support below the price.'; }
  }
  return { status, title, detail, zoneLevel, confirmed, checks, ladder };
}

export const SETUP_ORDER = { 'zone-confirmed': 0, zone: 1, wait: 2, extended: 3, below: 4, incomplete: 5, fail: 6 };
