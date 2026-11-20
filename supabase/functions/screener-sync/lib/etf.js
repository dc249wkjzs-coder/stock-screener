// ETFs: turning FMP fund data + price history into the row the site shows (the ETF "card"), and the fund's category.
// Funds have no earnings, so no moat, fair value or P/E: only cost, size, mix, returns and the chart (Fibonacci, RSI…).

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : x != null && Number.isFinite(Number(x)) ? Number(x) : null);
const pctStr = (x) => (x == null ? null : num(String(x).replace('%', '')));

// Fund companies label sectors differently (GICS "Information Technology" vs "Technology"); map them to the
// stock sectors used everywhere else on the site so a portfolio's sector mix adds up across stocks and ETFs.
const SECTOR_NAMES = {
  'information technology': 'Technology', technology: 'Technology', 'health care': 'Healthcare', healthcare: 'Healthcare',
  financials: 'Financial Services', 'financial services': 'Financial Services', financial: 'Financial Services',
  'consumer discretionary': 'Consumer Cyclical', 'consumer cyclical': 'Consumer Cyclical',
  'consumer staples': 'Consumer Defensive', 'consumer defensive': 'Consumer Defensive',
  materials: 'Basic Materials', 'basic materials': 'Basic Materials',
  'communication services': 'Communication Services', communications: 'Communication Services', telecommunications: 'Communication Services', 'telecommunication services': 'Communication Services',
  industrials: 'Industrials', energy: 'Energy', utilities: 'Utilities', 'real estate': 'Real Estate',
};
export const sectorName = (s) => SECTOR_NAMES[String(s || '').trim().toLowerCase()] || s;
// Renamed sectors can repeat (two labels for the same sector): add them up, largest first.
export const mergeSectors = (list) => Object.values((list || []).reduce((m, x) => {
  const s = sectorName(x.s);
  if (s && x.w > 0) (m[s] ||= { s, w: 0 }).w += x.w;
  return m;
}, {})).sort((a, b) => b.w - a.w);

export const LEVERAGED = /\b(2x|3x|-1x|-2x|-3x|ultra|ultrapro|inverse|bear|bull|leveraged|daily target)\b/i;

// FMP etf/info + country weightings → database fields. expenseRatio and exposures come in percent; stored as fractions.
export function etfInfoFields(info, countries) {
  if (!info) return {};
  const sectors = (info.sectorsList || [])
    .map((x) => ({ s: sectorName(x.industry), w: num(x.exposure) == null ? null : num(x.exposure) / 100 }))
    .filter((x) => x.s && x.w > 0);
  const merged = mergeSectors(sectors);
  const ctry = (countries || [])
    .map((x) => ({ c: x.country, w: pctStr(x.weightPercentage) == null ? null : pctStr(x.weightPercentage) / 100 }))
    .filter((x) => x.c && x.w > 0).sort((a, b) => b.w - a.w);
  return {
    name: info.name || null,
    issuer: info.etfCompany || null,
    asset_class: info.assetClass || null,
    expense_ratio: num(info.expenseRatio) == null ? null : num(info.expenseRatio) / 100,
    holdings_count: num(info.holdingsCount),
    inception: info.inceptionDate || null,
    description: info.description || null,
    website: info.website || null,
    sectors: merged, countries: ctry,
    // The screener list's "market cap" for a fund is sometimes the whole fund family; the fund's own figure is better.
    aum_info: num(info.assetsUnderManagement),
  };
}

// Plain category, checked in this order: leveraged/inverse, bonds, commodities, international, single-sector, broad.
export function etfCategory(r) {
  const name = `${r.name || ''}`;
  const ac = `${r.asset_class || r.assetClass || ''}`;
  if (LEVERAGED.test(name)) return 'Leveraged / inverse';
  if (/bond|fixed income|treasur|municipal|credit|income|t-bill|money market|aggregate/i.test(`${ac} ${name}`) && !/equity|dividend|stock/i.test(ac)) return 'Bonds';
  if (/commodit|gold|silver|bitcoin|ether|crypto|oil|natural gas|metals/i.test(`${ac} ${name}`)) return 'Commodities & crypto';
  const us = (r.countries || []).find((c) => /united states/i.test(c.c))?.w;
  if (r.countries?.length && (us ?? 0) < 0.5) return 'International';
  const top = r.sectors?.[0];
  if (top && top.w >= 0.6) return 'Sector';
  return 'Broad market';
}

// The compact row the ETF finder loads for every fund. tech = priceStats + fib from the daily closes (same as stocks).
export function makeEtfCard(r, tech) {
  const price = tech?.lastClose ?? num(r.price);
  const us = (r.countries || []).find((c) => /united states/i.test(c.c))?.w ?? null;
  const lastDiv = num(r.last_dividend);
  const sectors = mergeSectors(r.sectors);
  return {
    symbol: r.symbol, name: r.name, issuer: r.issuer, assetClass: r.asset_class, category: etfCategory({ ...r, sectors }), kind: 'etf',
    leveraged: LEVERAGED.test(r.name || ''),
    expenseRatio: num(r.expense_ratio), aum: num(r.aum_info) ?? num(r.aum), marketCap: num(r.aum_info) ?? num(r.aum), holdingsCount: num(r.holdings_count), inception: r.inception,
    sectors: sectors.slice(0, 11), countries: (r.countries || []).slice(0, 6), usShare: us,
    topSector: sectors[0]?.s ?? null, topSectorWeight: sectors[0]?.w ?? null,
    dividendYield: lastDiv != null && price > 0 ? lastDiv / price : null,
    beta: num(r.beta), avgVolume: num(r.avg_volume),
    price, priceDate: tech?.lastDate ?? null,
    offHigh: tech?.offHigh ?? null, rsi14: tech?.rsi14 ?? null, rsiMin10: tech?.rsiMin10 ?? null,
    sma20: tech?.sma20 ?? null, sma50: tech?.sma50 ?? null, sma200: tech?.sma200 ?? null,
    high52: tech?.high52 ?? null, low52: tech?.low52 ?? null,
    pullbackMax: tech?.pullbackMax ?? null, pullbackMedian: tech?.pullbackMedian ?? null, pullbackCount: tech?.pullbackCount ?? null,
    chg1m: tech?.chg1m ?? null, chg3m: tech?.chg3m ?? null, chg6m: tech?.chg6m ?? null, chg1y: tech?.chg1y ?? null,
    fib: tech?.fib ?? null, fibSupport: tech?.fib?.nextSupport ?? null, fibRetraced: tech?.fib?.retraced ?? null,
  };
}
