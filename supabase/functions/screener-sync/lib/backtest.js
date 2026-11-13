// Runs a screen over the point-in-time snapshots: at each quarterly date, buy the matching stocks in equal
// amounts, hold them to the next date, repeat. Compared with SPY (S&P 500) and with every screener stock in
// equal amounts (same survivorship bias as the screen, so the fairer yardstick for the screen's choices).
// Returns use dividend-adjusted prices (dividends reinvested). No trading costs or taxes.
import { BLANK, matches } from './criteria.js';
import { rowsOf } from './replay.js';

// Boxes that can't be replayed, and how the others are approximated.
export function replayable(c) {
  const C = { ...BLANK, ...c };
  const notes = [];
  if (C.aiRiskMax != null) notes.push('AI risk is ignored: the AI ratings are recent judgements, not available for past dates.');
  if (C.entry === 'zone' || C.entry === 'confirmed') notes.push('Entry timing "in the buy zone" / "buy zone · bouncing" is ignored; only "20%+ below its high" can be replayed.');
  if (C.peMin != null || C.peMax != null || C.pegMax != null) notes.push('P/E and PEG use the last annual EPS reported by then (analyst forecasts from the past aren\'t available).');
  if (C.growthMin != null || C.pegMax != null) notes.push('Earnings growth uses actual EPS growth over the two previous fiscal years instead of analyst forecasts.');
  if (C.noDilution) notes.push('"No recent share sales" counts a company as diluting if its share count rose more than 3% in its last fiscal year.');
  if (C.moatMin != null) notes.push('Moat uses the score calculated from the reports public at each date; written assessments and your own scores are today\'s judgements, so they aren\'t applied to the past.');
  if (C.profitable) notes.push('"Profitable" uses the last annual report at each date.');
  const today = ['roicMin', 'magicTop', 'payoutMax', 'chg1yMin', 'piotroskiMin', 'altmanMin', 'coverMin', 'aiBenefitMin'].filter((k) => C[k] != null);
  if (today.length) notes.push(`Ignored in the replay (only today's figures are stored): ${today.length} box${today.length > 1 ? 'es' : ''}.`);
  const off = Object.fromEntries(today.map((k) => [k, null]));
  return { criteria: { ...C, ...off, aiRiskMax: null, entry: C.entry === 'off20' ? 'off20' : 'any' }, notes };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// snaps: [{ asof, col, benchTr }] oldest first (col = column-wise record from replay.finishDate).
export function runBacktest(snaps, criteria, { start = 10000, maxPicks = 40 } = {}) {
  const { criteria: C, notes } = replayable(criteria);
  const periods = [];
  let screen = start, spy = start, all = start;
  const series = [{ asof: snaps[0]?.asof, screen, spy, all }];
  for (let k = 0; k < snaps.length - 1; k++) {
    const rows = rowsOf(snaps[k].col);
    const next = new Map(snaps[k + 1].col.symbol.map((s, i) => [s, snaps[k + 1].col.tr[i]]));
    const ret = (r) => { const t1 = next.get(r.symbol); return r.tr > 0 && t1 > 0 ? t1 / r.tr - 1 : null; };
    const usable = rows.filter((r) => ret(r) != null);
    const picks = usable.filter((r) => matches(r, C));
    const rScreen = picks.length ? mean(picks.map(ret)) : 0;   // no matches: sits in cash for the quarter
    const rAll = mean(usable.map(ret)) ?? 0;
    const rSpy = snaps[k].benchTr > 0 && snaps[k + 1].benchTr > 0 ? snaps[k + 1].benchTr / snaps[k].benchTr - 1 : 0;
    screen *= 1 + rScreen; spy *= 1 + rSpy; all *= 1 + rAll;
    series.push({ asof: snaps[k + 1].asof, screen, spy, all });
    const top = [...picks].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, maxPicks)
      .map((r) => ({ symbol: r.symbol, ret: ret(r) }));
    periods.push({ from: snaps[k].asof, to: snaps[k + 1].asof, n: picks.length, universe: usable.length, rScreen, rSpy, rAll, picks: top });
  }
  // What the screen picks at the latest date (no return yet).
  const last = snaps[snaps.length - 1];
  const now = last ? rowsOf(last.col).filter((r) => matches(r, C)) : [];
  return { notes, series, periods, stats: stats(series, periods), latest: { asof: last?.asof, n: now.length } };
}

function maxDrawdown(vals) {
  let peak = -Infinity, worst = 0;
  for (const v of vals) { peak = Math.max(peak, v); worst = Math.min(worst, v / peak - 1); }
  return worst;
}

export function stats(series, periods) {
  if (series.length < 2) return null;
  const years = (Date.parse(series[series.length - 1].asof) - Date.parse(series[0].asof)) / (365.25 * 864e5);
  const one = (key, rKey) => {
    const total = series[series.length - 1][key] / series[0][key] - 1;
    const rs = periods.map((p) => p[rKey]);
    return { total, cagr: years > 0 ? (1 + total) ** (1 / years) - 1 : null, maxDrawdown: maxDrawdown(series.map((s) => s[key])),
      worstQuarter: Math.min(...rs), bestQuarter: Math.max(...rs) };
  };
  return {
    years, screen: one('screen', 'rScreen'), spy: one('spy', 'rSpy'), all: one('all', 'rAll'),
    beatSpy: periods.filter((p) => p.rScreen > p.rSpy).length, quarters: periods.length,
    avgPicks: mean(periods.map((p) => p.n)), emptyQuarters: periods.filter((p) => p.n === 0).length,
  };
}
