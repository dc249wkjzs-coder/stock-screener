// Point-in-time replay: rebuilds each stock's numbers as they were at past dates, using only annual reports
// that had been published by then and prices up to then. Used by the backtest.
//
// Pipeline (Edge Function tasks in screener-sync):
//   history  – per stock: 12 years of annual income/balance/cash-flow statements (compacted by compactFy) and
//              weekly closes since 2016 (split-adjusted for valuation, dividend-adjusted for returns).
//   replay   – pass 1 (stockSnapshots): per stock, metrics at every snapshot date.
//              pass 2 (finishDate): per date, industry medians → moat score; stored column-wise per date.
// Approximations (shown on the backtest page): forward P/E → P/E on the last annual EPS; expected EPS growth →
// actual EPS growth over the previous two fiscal years; "no recent share sales" → share count grew under 3%
// in the last fiscal year; beta from 2 years of weekly returns vs SPY; foreign reporters use today's currency rate.
import { roicOf } from './metrics.js';
import { moatScore } from './crossSection.js';

export const QUARTERS = 20;          // five years of quarterly rebalances
export const STEP_WEEKS = 13;
export const FILING_LAG_DAYS = 90;   // used when FMP gives no filing date

const INC = ['date', 'filingDate', 'reportedCurrency', 'revenue', 'grossProfit', 'operatingIncome', 'ebit', 'ebitda', 'incomeBeforeTax', 'incomeTaxExpense', 'netIncome', 'epsDiluted', 'weightedAverageShsOutDil'];
const BAL = ['totalAssets', 'cashAndShortTermInvestments', 'cashAndCashEquivalents', 'longTermInvestments', 'goodwillAndIntangibleAssets', 'totalCurrentLiabilities', 'shortTermDebt', 'totalDebt'];
const CF = ['freeCashFlow', 'commonDividendsPaid', 'netDividendsPaid'];
const pick = (row, keys) => Object.fromEntries(keys.filter((k) => row?.[k] != null).map((k) => [k, row[k]]));

// One merged row per fiscal year, newest first. Balance and cash-flow rows are matched on the fiscal year end.
export function compactFy(income, balance, cash) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  const b = new Map(arr(balance).map((r) => [r.date, r]));
  const c = new Map(arr(cash).map((r) => [r.date, r]));
  return arr(income).filter((r) => r.date).sort((x, y) => (x.date < y.date ? 1 : -1))
    .map((r) => ({ ...pick(r, INC), ...pick(b.get(r.date), BAL), ...pick(c.get(r.date), CF) }));
}

// Daily [date, close] rows (any order) → last close of each week, oldest first.
export function toWeekly(rows) {
  const sorted = [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = new Map();
  for (const [d, c] of sorted) if (c > 0) out.set(Math.floor((Date.parse(d) / 864e5 + 3) / 7), [d, c]);
  return [...out.values()];
}

// Raw fetchHistory result → stored history: compact statements + aligned weekly close / total-return arrays.
export function buildHistory(raw) {
  const wc = toWeekly(raw.light), wt = new Map(toWeekly(raw.adj).map(([d, c]) => [d, c]));
  return { fy: compactFy(raw.income, raw.balance, raw.cash), weeks: wc.map((w) => w[0]), close: wc.map((w) => w[1]), tr: wc.map((w) => wt.get(w[0]) ?? null) };
}

// Snapshot dates: every 13 weeks back from the latest week of the benchmark, oldest first.
export function snapshotDates(benchWeeks, quarters = QUARTERS) {
  const out = [];
  for (let i = benchWeeks.length - 1, k = 0; i >= 0 && k <= quarters; i -= STEP_WEEKS, k++) out.unshift(benchWeeks[i]);
  return out;
}

const published = (fy) => fy.filingDate || new Date(Date.parse(fy.date) + FILING_LAG_DAYS * 864e5).toISOString().slice(0, 10);
const median = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// Index of the last week on or before a date (weeks sorted ascending), or -1.
function weekAt(weeks, d) {
  let lo = 0, hi = weeks.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (weeks[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// Beta from up to 104 weekly returns ending at index i (stock) and the matching benchmark weeks.
function betaAt(h, bench, d) {
  const xs = [], ys = [];
  const bi = weekAt(bench.weeks, d), si = weekAt(h.weeks, d);
  if (bi < 30 || si < 30) return null;
  const bmap = new Map(bench.weeks.slice(Math.max(0, bi - 105), bi + 1).map((w, k, a) => [w, k]));
  const bslice = bench.close.slice(Math.max(0, bi - 105), bi + 1);
  for (let k = Math.max(1, si - 104); k <= si; k++) {
    const j = bmap.get(h.weeks[k]), j0 = bmap.get(h.weeks[k - 1]);
    if (j == null || j0 == null) continue;
    xs.push(bslice[j] / bslice[j0] - 1); ys.push(h.close[k] / h.close[k - 1] - 1);
  }
  if (xs.length < 30) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0, vx = 0;
  for (let k = 0; k < xs.length; k++) { cov += (xs[k] - mx) * (ys[k] - my); vx += (xs[k] - mx) ** 2; }
  return vx > 0 ? cov / vx : null;
}

// Pass 1: one stock's metrics at each date. h = { fy, weeks, close, tr }; now = today's { price, marketCap, fx, sector, industry }.
export function stockSnapshots(h, bench, dates, now) {
  const out = {};
  if (!h?.weeks?.length || !h.fy?.length || !now?.price || !now?.marketCap) return out;
  const fx = now.fx ?? 1;
  const lastIdx = h.weeks.length - 1;
  const shNow = h.fy[0]?.weightedAverageShsOutDil;
  for (const d of dates) {
    const i = weekAt(h.weeks, d);
    if (i < 0 || h.weeks[i] < shift(d, -21)) continue;         // not trading yet (or a long gap)
    const avail = h.fy.filter((r) => published(r) <= d);
    if (!avail.length) continue;
    const L = avail[0], P = avail[1], P2 = avail[2], P3 = avail[3];
    const price = h.close[i];
    const sh = L.weightedAverageShsOutDil;
    // Market cap scaled from today's by price and share-count change (works for ADRs and any currency).
    const marketCap = shNow > 0 && sh > 0 ? now.marketCap * (price / now.price) * (sh / shNow) : null;
    const perShareUsd = (x) => (x != null && sh > 0 ? (x / sh) * fx : null);
    const eps = L.epsDiluted != null ? L.epsDiluted * fx : perShareUsd(L.netIncome);
    const pe = eps > 0 ? price / eps : null;
    const e2 = P2?.epsDiluted;
    const growth = L.epsDiluted > 0 && e2 > 0 ? Math.sqrt(L.epsDiluted / e2) - 1 : null;
    const netDebt = L.totalDebt != null ? L.totalDebt - (L.cashAndShortTermInvestments ?? L.cashAndCashEquivalents ?? 0) : null;
    const ret52 = h.close.slice(Math.max(0, i - 51), i + 1);
    const hi52 = Math.max(...ret52);
    let peak = -Infinity, worst = 0;
    for (const c of h.close.slice(Math.max(0, i - 104), i + 1)) { peak = Math.max(peak, c); worst = Math.min(worst, c / peak - 1); }
    const div = Math.abs(L.commonDividendsPaid ?? L.netDividendsPaid ?? 0);
    const five = avail.slice(0, 5);
    const roicYears = five.map((r) => roicOf(r, r)).filter((x) => x != null);
    const sortedRoic = [...roicYears].sort((a, b) => a - b);
    out[d] = {
      price, tr: h.tr[i] ?? null, marketCap, beta: betaAt(h, bench, d),
      forwardPE: pe, peTtm: pe, epsGrowth: growth, peg: pe != null && growth > 0 ? pe / (growth * 100) : null,
      ebitdaMargin: L.revenue > 0 && L.ebitda != null ? L.ebitda / L.revenue : null,
      netDebtToEbitda: netDebt != null && L.ebitda > 0 ? netDebt / L.ebitda : netDebt != null && netDebt <= 0 ? -1 : null,
      gaapLossTtm: L.netIncome != null ? L.netIncome < 0 : null,
      recentRaises: P?.weightedAverageShsOutDil > 0 && sh / P.weightedAverageShsOutDil - 1 > 0.03 ? [{ kind: 'equity', date: L.date }] : [],
      revenueGrowth: L.revenue > 0 && P?.revenue > 0 ? L.revenue / P.revenue - 1 : null,
      revenueGrowth3y: L.revenue > 0 && P3?.revenue > 0 ? (L.revenue / P3.revenue) ** (1 / 3) - 1 : null,
      fcfYield: L.freeCashFlow != null && price > 0 ? perShareUsd(L.freeCashFlow) / price : null,
      dividendYield: price > 0 ? (perShareUsd(div) || 0) / price : null,
      offHigh: hi52 > 0 ? price / hi52 - 1 : null, pullbackMax: worst,
      // moat inputs (score added in pass 2, which needs every stock's margins at this date)
      mi: {
        roicYears, roicMedian: sortedRoic.length ? sortedRoic[Math.floor((sortedRoic.length - 1) / 2)] : null,
        incomeYears: five.length, lossYears: five.filter((r) => (r.operatingIncome ?? r.ebit) < 0).length,
        grossMarginYears: five.map((r) => (r.revenue > 0 && r.grossProfit != null ? r.grossProfit / r.revenue : null)).filter((x) => x != null),
        opMarginYears: five.map((r) => (r.revenue > 0 ? (r.operatingIncome ?? r.ebit) / r.revenue : null)).filter((x) => x != null),
      },
      fy: L.date,
    };
    out[d].mi.grossMargin = out[d].mi.grossMarginYears[0] ?? null;
    out[d].mi.operatingMargin = out[d].mi.opMarginYears[0] ?? null;
  }
  return out;
}
const shift = (d, days) => new Date(Date.parse(d) + days * 864e5).toISOString().slice(0, 10);

// Column-wise fields stored per date (compact for the backtest to load).
export const FIELDS = ['price', 'tr', 'marketCap', 'beta', 'forwardPE', 'epsGrowth', 'peg', 'ebitdaMargin', 'netDebtToEbitda', 'gaapLossTtm',
  'dilution', 'revenueGrowth', 'fcfYield', 'dividendYield', 'offHigh', 'pullbackMax', 'moat'];

// Pass 2: all stocks at one date → moat with that date's industry medians → column-wise record.
export function finishDate(rows) {
  // rows: [{ symbol, sector, industry, s }] where s = stockSnapshots(...)[date]
  const byInd = {};
  for (const r of rows) (byInd[r.industry || '—'] ||= []).push(r);
  const ctx = { industryMedianOpMargin: {}, industryMedianGrossMargin: {}, industrySize: {} };
  for (const [ind, list] of Object.entries(byInd)) {
    ctx.industryMedianOpMargin[ind] = median(list.map((r) => r.s.mi.operatingMargin));
    ctx.industryMedianGrossMargin[ind] = median(list.map((r) => (r.s.mi.grossMargin >= 0.995 ? null : r.s.mi.grossMargin)));
    ctx.industrySize[ind] = list.length;
  }
  const col = { symbol: [], sector: [], industry: [] };
  for (const f of FIELDS) col[f] = [];
  const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  for (const r of rows) {
    const s = r.s;
    const moat = moatScore({ ...s.mi, industry: r.industry }, ctx).score;
    col.symbol.push(r.symbol); col.sector.push(r.sector); col.industry.push(r.industry);
    for (const f of FIELDS) {
      const v = f === 'moat' ? moat : f === 'dilution' ? (s.recentRaises?.length ? 1 : 0) : f === 'gaapLossTtm' ? (s.gaapLossTtm == null ? null : s.gaapLossTtm ? 1 : 0) : s[f];
      col[f].push(f === 'price' || f === 'tr' || f === 'marketCap' ? (v == null ? null : Number(v.toPrecision(7))) : r4(v));
    }
  }
  return col;
}

// Column-wise record → stock-like objects that criteria.checks() understands.
export function rowsOf(col) {
  return col.symbol.map((symbol, i) => ({
    symbol, sector: col.sector[i], industry: col.industry[i], price: col.price[i], tr: col.tr[i], marketCap: col.marketCap[i],
    beta: col.beta[i], forwardPE: col.forwardPE[i], epsGrowth: col.epsGrowth[i], peg: col.peg[i], ebitdaMargin: col.ebitdaMargin[i],
    netDebtToEbitda: col.netDebtToEbitda[i], gaapLossTtm: col.gaapLossTtm[i] == null ? null : col.gaapLossTtm[i] === 1,
    recentRaises: col.dilution[i] ? [{ kind: 'equity', date: '' }] : [], revenueGrowth: col.revenueGrowth[i], fcfYield: col.fcfYield[i],
    dividendYield: col.dividendYield[i], offHigh: col.offHigh[i], pullbackMax: col.pullbackMax[i], moatUsed: col.moat[i], moat: { score: col.moat[i] },
  }));
}
