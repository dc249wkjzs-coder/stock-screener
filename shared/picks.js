// "Best matches": ranks the stocks that passed a screen against each other, in a few plain categories.
// Everything is a rank within the matching group (100 = best in the group, 0 = worst), so the picks always
// say which numbers put a stock on top. A ranking of the screen's own results, not a buy recommendation.

// Rank of each stock on one number within the group: 1 = best, 0 = worst, null = no figure.
// lowerIsBetter flips the order. Ties share the average rank.
export function rankWithin(stocks, get, lowerIsBetter = false) {
  const vals = stocks.map((s) => [s.symbol, get(s)]).filter(([, v]) => v != null && Number.isFinite(v));
  const out = {};
  if (!vals.length) return out;
  if (vals.length === 1) { out[vals[0][0]] = 1; return out; }
  vals.sort((a, b) => (lowerIsBetter ? b[1] - a[1] : a[1] - b[1]));   // worst first
  let i = 0;
  while (i < vals.length) {
    let j = i;
    while (j + 1 < vals.length && vals[j + 1][1] === vals[i][1]) j++;
    const r = (i + j) / 2 / (vals.length - 1);
    for (let k = i; k <= j; k++) out[vals[k][0]] = r;
    i = j + 1;
  }
  return out;
}

const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// Debt for ranking: net cash counts as -1x (better than any debt); a loss-maker's debt multiple is meaningless.
const debtOf = (s) => (s.netDebtToEbitda == null ? null : Math.max(-1, s.netDebtToEbitda));
const ENTRY_SCORE = { 'zone-confirmed': 1, zone: 0.8, wait: 0.5, below: 0.3, extended: 0.2 };
const MISSING = 0.4;   // a missing group scores a little below the middle, so thin data doesn't win

export const PICK_WEIGHTS = { quality: 0.3, growth: 0.25, value: 0.25, strength: 0.1, entry: 0.1 };
export const GROUP_LABELS = { quality: 'Quality', growth: 'Growth', value: 'Value', strength: 'Balance sheet', entry: 'Entry timing' };

export function bestMatches(stocks, { top = 3, topOverall = 5 } = {}) {
  const S = stocks.filter((s) => s && s.symbol);
  const R = {
    moat: rankWithin(S, (s) => s.moatUsed),
    eps: rankWithin(S, (s) => s.epsGrowth),
    sales: rankWithin(S, (s) => s.revenueGrowth),
    sales3: rankWithin(S, (s) => s.revenueGrowth3y),
    peg: rankWithin(S, (s) => (s.peg > 0 ? s.peg : null), true),
    pe: rankWithin(S, (s) => (s.forwardPE > 0 ? s.forwardPE : null), true),
    fair: rankWithin(S, (s) => s.fair?.vsMid ?? null, true),
    fcf: rankWithin(S, (s) => s.fcfYield),
    debt: rankWithin(S, debtOf, true),
    margin: rankWithin(S, (s) => s.ebitdaMargin),
    div: rankWithin(S, (s) => (s.dividendYield > 0 ? s.dividendYield : null)),
  };
  const g = (s) => {
    const r = (k) => R[k][s.symbol] ?? null;
    const strength = s.gaapLossTtm ? 0 : r('debt');
    return {
      quality: r('moat'),
      growth: avg([r('eps'), r('sales')]),
      value: avg([r('peg'), r('fair'), r('fcf')]),
      strength,
      entry: ENTRY_SCORE[s.setup?.status] ?? null,
    };
  };
  const scored = S.map((s) => {
    const groups = g(s);
    const present = Object.values(groups).filter((x) => x != null).length;
    const overall = Object.entries(PICK_WEIGHTS).reduce((t, [k, w]) => t + w * (groups[k] ?? MISSING), 0);
    return { s, groups, present, overall, r: (k) => R[k][s.symbol] ?? null };
  });
  const best = (list, score, n = top) => list.map((x) => ({ ...x, score: score(x) })).filter((x) => x.score != null)
    .sort((a, b) => b.score - a.score || (b.s.marketCap || 0) - (a.s.marketCap || 0)).slice(0, n);
  const f = (key, x, rank) => ({ key, value: key === 'setup' ? x.s.setup : key === 'fairGap' ? x.s.fair?.vsMid ?? null : x.s[key], rank: rank ?? null });

  const cats = [
    {
      id: 'overall', title: 'Best all-round',
      how: 'Quality 30% · growth 25% · value 25% · balance sheet 10% · entry timing 10%, each ranked within this group.',
      picks: best(scored.filter((x) => x.present >= 3 && x.groups.quality != null), (x) => x.overall, topOverall)
        .map((x) => ({ ...x, factors: Object.keys(PICK_WEIGHTS).map((k) => ({ key: k, group: true, value: x.groups[k] })) })),
    },
    {
      id: 'entry', title: 'Best price to buy now',
      how: 'At a Fibonacci buy level right now (bounce confirmed first), then the strongest business by quality, growth and balance sheet.',
      picks: best(scored.filter((x) => x.s.setup?.status === 'zone' || x.s.setup?.status === 'zone-confirmed'),
        (x) => (x.s.setup.status === 'zone-confirmed' ? 1 : 0) + (avg([x.groups.quality, x.groups.growth, x.groups.strength]) ?? 0))
        .map((x) => ({ ...x, factors: [f('setup', x), f('rsi14', x), f('offHigh', x), f('fairGap', x, x.r('fair')), f('moatUsed', x, x.r('moat'))] })),
    },
    {
      id: 'value', title: 'Best value',
      how: 'Cheapest against growth (PEG), against its fair value range and on free cash flow. Profitable companies with a moat of 5 or more only, to avoid cheap-for-a-reason stocks.',
      picks: best(scored.filter((x) => !x.s.gaapLossTtm && (x.s.moatUsed ?? 0) >= 5), (x) => x.groups.value)
        .map((x) => ({ ...x, factors: [f('peg', x, x.r('peg')), f('forwardPE', x, x.r('pe')), f('fairGap', x, x.r('fair')), f('fcfYield', x, x.r('fcf')), f('moatUsed', x)] })),
    },
    {
      id: 'quality', title: 'Highest quality',
      how: 'Strongest moat (counted twice), highest profit margin and least debt (loss-makers last).',
      picks: best(scored.filter((x) => x.groups.quality != null), (x) => avg([x.groups.quality, x.groups.quality, x.r('margin'), x.groups.strength]))
        .map((x) => ({ ...x, factors: [f('moatUsed', x, x.r('moat')), f('ebitdaMargin', x, x.r('margin')), f('netDebtToEbitda', x, x.r('debt')), f('aiRisk', x)] })),
    },
    {
      id: 'growth', title: 'Fastest growth',
      how: 'Expected earnings growth plus sales growth over the last year and the last three years. Growing earnings only.',
      picks: best(scored.filter((x) => x.s.epsGrowth > 0), (x) => avg([x.r('eps'), x.r('sales'), x.r('sales3')]))
        .map((x) => ({ ...x, factors: [f('epsGrowth', x, x.r('eps')), f('revenueGrowth', x, x.r('sales')), f('revenueGrowth3y', x, x.r('sales3')), f('peg', x)] })),
    },
    {
      id: 'income', title: 'Best dividend',
      how: 'Dividend of 1.5% or more that takes no more than 75% of profit, ranked on yield, moat and balance sheet.',
      picks: best(scored.filter((x) => x.s.dividendYield >= 0.015 && x.s.payoutRatio != null && x.s.payoutRatio <= 0.75 && !x.s.gaapLossTtm),
        (x) => avg([x.r('div'), x.groups.quality, x.groups.strength]))
        .map((x) => ({ ...x, factors: [f('dividendYield', x, x.r('div')), f('payoutRatio', x), f('moatUsed', x), f('netDebtToEbitda', x)] })),
    },
  ];
  return cats.map((c) => ({ ...c, picks: c.picks.map(({ s, score, factors }) => ({ stock: s, score, factors })) }));
}
