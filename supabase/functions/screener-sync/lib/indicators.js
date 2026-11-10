// Technical indicators from daily closing prices. prices = [[ 'YYYY-MM-DD', close ], ...] oldest first.

// RSI(14), Wilder's smoothing.
export function rsi(prices, period = 14) {
  const closes = prices.map((p) => p[1]);
  if (closes.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function sma(prices, n) {
  if (prices.length < n) return null;
  let s = 0;
  for (let i = prices.length - n; i < prices.length; i++) s += prices[i][1];
  return s / n;
}

export const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786, 1];

// Fibonacci retracement (buy-side entry levels) on daily closes.
// Swing high = highest close in the last 52 weeks.
// Swing low  = lowest close in the 52 weeks before that high (the start of the advance).
//              If the price has since fallen below that low, the leg is broken, so the swing low
//              moves back to the lowest close in all stored history (~2 years) before the high.
// Levels     = swing high − ratio × (swing high − swing low).
export function fibonacci(prices, lookbackDays = 252) {
  if (prices.length < 30) return null;
  const recent = prices.slice(-lookbackDays);
  let high = recent[0];
  for (const p of recent) if (p[1] >= high[1]) high = p;
  const hiPos = prices.findIndex((p) => p[0] === high[0]);
  const last = prices[prices.length - 1][1];
  const lowIn = (from) => {
    const leg = prices.slice(Math.max(0, from), hiPos);
    let low = null;
    for (const p of leg) if (!low || p[1] <= low[1]) low = p;
    return low;
  };
  let low = lowIn(hiPos - lookbackDays);
  let widened = false;
  if (low && last < low[1]) { const wide = lowIn(0); if (wide && wide[1] < low[1]) { low = wide; widened = true; } }
  if (!low) return null;
  const range = high[1] - low[1];
  if (range <= 0) return null;
  const levels = FIB_RATIOS.map((r) => ({ ratio: r, price: high[1] - r * range }));
  const nextSupport = levels.filter((l) => l.price < last).sort((a, b) => b.price - a.price)[0] || null;
  return {
    swingHigh: { date: high[0], price: high[1] },
    swingLow: { date: low[0], price: low[1] },
    range,
    levels,
    nextSupport,
    // How far the current price has retraced the leg (0 = at the high, 1 = back at the low).
    retraced: (high[1] - last) / range,
    widened,
    belowSwing: last < low[1],
    formula: 'level = swing high − ratio × (swing high − swing low), on daily closes',
  };
}

export function priceStats(prices) {
  if (!prices.length) return {};
  const last = prices[prices.length - 1];
  const yr = prices.slice(-252);
  const hi = Math.max(...yr.map((p) => p[1]));
  const lo = Math.min(...yr.map((p) => p[1]));
  const back = (n) => (prices.length > n ? prices[prices.length - 1 - n][1] : null);
  const chg = (n) => { const b = back(n); return b ? last[1] / b - 1 : null; };
  const rs = rsiSeries(prices.slice(-300));
  const recentRsi = rs.slice(-10).filter((x) => x != null);
  const pb = pullbacks(prices);
  return {
    lastDate: last[0], lastClose: last[1], high52: hi, low52: lo,
    offHigh: last[1] / hi - 1, chg1m: chg(21), chg3m: chg(63), chg6m: chg(126), chg1y: chg(252),
    sma20: sma(prices, 20), sma50: sma(prices, 50), sma200: sma(prices, 200), rsi14: rsi(prices.slice(-300)),
    rsiMin10: recentRsi.length ? Math.min(...recentRsi) : null,
    pullbackMax: pb.max, pullbackMedian: pb.median, pullbackCount: pb.count, historyDays: prices.length,
  };
}

// RSI(14) for every day (null for the first 14).
export function rsiSeries(prices, period = 14) {
  const c = prices.map((p) => p[1]);
  const out = new Array(c.length).fill(null);
  if (c.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = c[i] - c[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// Past pullbacks of 5% or more from a running high, over all stored history (~2 years).
// A pullback ends when the price makes a new high; the current one counts if it is 5%+ deep.
// Returns the deepest and the typical (median) depth as negative fractions.
export function pullbacks(prices, minDepth = 0.05) {
  const depths = [];
  let peak = -Infinity, trough = 0;
  for (const [, c] of prices) {
    if (c > peak) { if (trough <= -minDepth) depths.push(trough); peak = c; trough = 0; continue; }
    trough = Math.min(trough, c / peak - 1);
  }
  if (trough <= -minDepth) depths.push(trough);
  if (!depths.length) return { max: null, median: null, count: 0 };
  const sorted = [...depths].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { max: sorted[0], median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, count: depths.length };
}
