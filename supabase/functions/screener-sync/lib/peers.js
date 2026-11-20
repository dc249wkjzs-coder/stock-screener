// Industry and market medians for the figures on the stock page, so each figure can be shown next to what is
// normal: "Forward P/E 32x · industry 24x · market 18x". Computed once over every stock in the screener.
// Valuation multiples only count positive values (a negative P/E means a loss, not a cheap stock).

export const PEER_METRICS = {
  forwardPE: { better: 'low', positive: true, kind: 'x' },
  peTtm: { better: 'low', positive: true, kind: 'x' },
  peg: { better: 'low', positive: true, kind: 'x' },
  evToEbitda: { better: 'low', positive: true, kind: 'x' },
  fcfYield: { better: 'high', kind: '%' },
  dividendYield: { better: 'high', kind: '%' },
  epsGrowth: { better: 'high', kind: '%' },
  revenueGrowth: { better: 'high', kind: '%' },
  revenueGrowth3y: { better: 'high', kind: '%' },
  fcfMargin: { better: 'high', kind: '%' },
  ebitdaMargin: { better: 'high', kind: '%' },
  netDebtToEbitda: { better: 'low', kind: 'x' },
};
export const MIN_PEERS = 5;

const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b), m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const valid = (key, v) => v != null && Number.isFinite(v) && (!PEER_METRICS[key].positive || v > 0);

export function peerStats(stocks) {
  const groups = { market: { all: stocks }, industry: {}, sector: {} };
  for (const s of stocks) {
    (groups.industry[s.industry || '—'] ||= []).push(s);
    (groups.sector[s.sector || '—'] ||= []).push(s);
  }
  const stat = (list) => {
    const out = {};
    for (const key of Object.keys(PEER_METRICS)) {
      const vals = list.map((s) => s[key]).filter((v) => valid(key, v));
      out[key] = { median: median(vals), n: vals.length };
    }
    return out;
  };
  return {
    market: stat(stocks),
    industry: Object.fromEntries(Object.entries(groups.industry).map(([k, l]) => [k, stat(l)])),
    sector: Object.fromEntries(Object.entries(groups.sector).map(([k, l]) => [k, stat(l)])),
  };
}

// One stock's figure against its industry (or sector, when the industry has too few) and the whole market.
// verdict: 'below' | 'above' | 'between' | null; cheap: true when the figure is the better side of both medians.
export function compare(s, key, stats) {
  const def = PEER_METRICS[key];
  if (!def || !stats) return null;
  const v = s[key];
  const ind = stats.industry[s.industry || '—']?.[key];
  const sec = stats.sector[s.sector || '—']?.[key];
  const group = ind?.n >= MIN_PEERS ? { label: 'industry', ...ind } : sec?.n >= MIN_PEERS ? { label: 'sector', ...sec } : null;
  const market = stats.market[key];
  const refs = [group?.median, market?.median].filter((x) => x != null);
  let verdict = null;
  if (valid(key, v) && refs.length) {
    if (refs.every((r) => v < r)) verdict = 'below';
    else if (refs.every((r) => v > r)) verdict = 'above';
    else verdict = 'between';
  }
  const better = verdict === 'between' || verdict == null ? null : (verdict === 'below') === (def.better === 'low');
  return { key, value: v, valid: valid(key, v), group, market: market?.median ?? null, verdict, better, def };
}
