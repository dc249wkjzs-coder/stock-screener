// "What if I bought these 1 or 3 years ago?": buys the chosen stocks once, at the chosen shares, on the first trading week
// of the period and holds them (no rebalancing), dividends reinvested, compared with the S&P 500 (SPY) bought the same day.
// A stock that wasn't listed yet keeps its money in cash until its first week of trading, then buys it.
// Prices are weekly closes from the stored history (dividend-adjusted when available).

const weekNo = (d) => Math.floor((Date.parse(d) / 864e5 + 3) / 7);

// One price series per symbol, keyed by week number: dividend-adjusted where present, else the close.
function seriesOf(h) {
  const m = new Map();
  if (!h?.weeks) return m;
  // Splice the two series so a missing adjusted price doesn't break the chain: scale closes to the adjusted level.
  let scale = null;
  for (let i = 0; i < h.weeks.length; i++) {
    const c = Number(h.close?.[i]), t = h.tr?.[i] == null ? null : Number(h.tr[i]);
    if (t > 0 && c > 0) scale = t / c;
    const v = t > 0 ? t : c > 0 ? c * (scale ?? 1) : null;
    if (v > 0) m.set(weekNo(h.weeks[i]), { date: h.weeks[i], v });
  }
  return m;
}

export function pastPerformance(holdings, histories, { years = 5, start = 10000 } = {}) {
  const bench = seriesOf(histories.SPY);
  const bw = [...bench.keys()].sort((a, b) => a - b);
  if (bw.length < 30) return null;
  const last = bw[bw.length - 1];
  const first = bw.find((w) => w >= last - Math.round(years * 52.18)) ?? bw[0];
  const grid = bw.filter((w) => w >= first);

  const stocks = holdings.map((h) => {
    const s = seriesOf(histories[h.symbol]);
    const weeks = [...s.keys()].filter((w) => w >= first).sort((a, b) => a - b);
    return { symbol: h.symbol, w: h.w, s, buyWeek: weeks[0] ?? null };
  });

  const out = { start, series: [], stocks: [], benchSymbol: 'SPY' };
  const spy0 = bench.get(first).v;
  const pos = stocks.map((x) => ({ ...x, units: null, cash: start * x.w, lastV: null }));
  for (const w of grid) {
    let total = 0;
    for (const p of pos) {
      const px = p.s.get(w)?.v;
      if (p.units == null && px > 0 && (p.buyWeek != null && w >= p.buyWeek)) { p.units = p.cash / px; p.cash = 0; p.buyDate = p.s.get(w).date; p.buyPx = px; }
      if (px > 0) p.lastV = px;
      total += p.units != null ? p.units * (p.lastV ?? 0) + p.cash : p.cash;
    }
    const b = bench.get(w);
    out.series.push({ asof: b.date, mine: total, spy: (start * b.v) / spy0 });
  }
  const end = out.series[out.series.length - 1];
  const yrs = (Date.parse(end.asof) - Date.parse(out.series[0].asof)) / (365.25 * 864e5);
  const stat = (key) => {
    const total = end[key] / start - 1;
    let peak = -Infinity, worst = 0, worstAt = null;
    for (const r of out.series) { peak = Math.max(peak, r[key]); const dd = r[key] / peak - 1; if (dd < worst) { worst = dd; worstAt = r.asof; } }
    return { end: end[key], total, cagr: yrs > 0 ? (1 + total) ** (1 / yrs) - 1 : null, maxDrawdown: worst, worstAt };
  };
  out.from = out.series[0].asof; out.to = end.asof; out.years = yrs;
  out.mine = stat('mine'); out.spy = stat('spy');
  out.stocks = pos.map((p) => {
    const value = p.units != null ? p.units * p.lastV : p.cash;
    return {
      symbol: p.symbol, w: p.w, invested: start * p.w, value, ret: start * p.w > 0 ? value / (start * p.w) - 1 : null,
      bought: p.buyDate ?? null, late: p.buyDate ? weekNo(p.buyDate) > first + 1 : false, noData: p.buyWeek == null,
    };
  }).sort((a, b) => (b.value - b.invested) - (a.value - a.invested));
  return out;
}
