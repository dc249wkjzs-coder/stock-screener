// Market today: the US market's state (open / pre-market / after hours / closed, holidays), what the tiles show,
// and the day's moves (gainers, losers, sectors, breadth) worked out from one price per stock and ETF.
// Used by the Edge Function `market-today` (which stores a snapshot in scr_market) and by the page.

// NYSE full-day closures and 1pm early closes (official NYSE calendar). FMP's holiday list was incomplete (no Thanksgiving).
export const NYSE_HOLIDAYS = {
  '2026-01-01': "New Year's Day", '2026-01-19': 'Martin Luther King Jr. Day', '2026-02-16': "Washington's Birthday",
  '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day',
  '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas',
  '2027-01-01': "New Year's Day", '2027-01-18': 'Martin Luther King Jr. Day', '2027-02-15': "Washington's Birthday",
  '2027-03-26': 'Good Friday', '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth', '2027-07-05': 'Independence Day',
  '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving', '2027-12-24': 'Christmas',
};
export const EARLY_CLOSE = { '2026-11-27': '13:00', '2026-12-24': '13:00', '2027-11-26': '13:00' };

// What the tiles show. via = an ETF standing in for something the data plan doesn't quote directly.
export const TILES = [
  { sym: '^GSPC', label: 'S&P 500', group: 'Indexes', term: 'index', spark: '5min' },
  { sym: '^DJI', label: 'Dow Jones', group: 'Indexes', term: 'index', spark: '5min' },
  { sym: '^IXIC', label: 'Nasdaq', group: 'Indexes', term: 'index', spark: '5min' },
  { sym: '^RUT', label: 'Russell 2000', group: 'Indexes', term: 'index', spark: '5min' },
  { sym: 'ESUSD', label: 'S&P 500 futures', group: 'Futures', term: 'futures', spark: '1hour' },
  { sym: '^VIX', label: 'VIX (fear gauge)', group: 'Fear gauge', term: 'vix' },
  { sym: 'GCUSD', label: 'Gold', group: 'Commodities', term: 'gold', unit: 'per ounce' },
  { sym: 'SIUSD', label: 'Silver', group: 'Commodities', term: 'gold', unit: 'per ounce' },
  { sym: 'BZUSD', label: 'Oil (Brent)', group: 'Commodities', term: 'oil', unit: 'per barrel' },
  { sym: 'USO', label: 'Oil (US, WTI)', group: 'Commodities', term: 'oil', via: 'USO ETF' },
  { sym: 'UNG', label: 'Natural gas', group: 'Commodities', term: 'oil', via: 'UNG ETF' },
  { sym: 'CPER', label: 'Copper', group: 'Commodities', term: 'copper', via: 'CPER ETF' },
  { sym: 'TLT', label: 'Long-term Treasuries', group: 'Bonds, dollar, crypto', term: 'treasuries', via: 'TLT ETF' },
  { sym: 'UUP', label: 'US dollar', group: 'Bonds, dollar, crypto', term: 'dollar', via: 'UUP ETF' },
  { sym: 'BTCUSD', label: 'Bitcoin', group: 'Bonds, dollar, crypto', term: 'bitcoin' },
];

// VIX zones (long-run average is about 19–20).
export const VIX_ZONES = [
  { max: 15, label: 'Calm', note: 'Investors expect small daily swings.' },
  { max: 20, label: 'Normal', note: 'Around its long-run average.' },
  { max: 30, label: 'Nervous', note: 'Bigger swings expected; selling is often under way.' },
  { max: Infinity, label: 'Fear', note: 'Very high: big daily swings are expected (about ±2% a day at 30).' },
];
export const vixZone = (v) => (v == null ? null : VIX_ZONES.find((z) => v < z.max));

// ---------- New York time
const NY = 'America/New_York';
export function nyParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: p.weekday };
}
// A New York wall-clock time on a date → the real moment (handles summer/winter time).
export function nyToUtc(date, hm) {
  for (const off of [-5, -4]) {
    const t = new Date(`${date}T${hm}:00${off === -5 ? '-05:00' : '-04:00'}`);
    const p = nyParts(t);
    if (p.date === date && p.hm === hm) return t;
  }
  return new Date(`${date}T${hm}:00-05:00`);
}
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
export const isTradingDay = (date) => weekday(date) !== 0 && weekday(date) !== 6 && !NYSE_HOLIDAYS[date];
export function nextTradingDay(date) { let d = addDays(date, 1); while (!isTradingDay(d)) d = addDays(d, 1); return d; }
export function prevTradingDay(date) { let d = addDays(date, -1); while (!isTradingDay(d)) d = addDays(d, -1); return d; }

// state: open | pre (4:00–9:30) | after (close–20:00) | closed. Times as real moments so the page can show them in Dubai time.
export function marketStatus(now = new Date()) {
  const { date, hm } = nyParts(now);
  const close = EARLY_CLOSE[date] || '16:00';
  const nextOpenDay = isTradingDay(date) && hm < '09:30' ? date : nextTradingDay(date);
  const base = { nyDate: date, nyTime: hm, nextOpen: nyToUtc(nextOpenDay, '09:30').toISOString(), nextOpenDay, nextOpenEarlyClose: EARLY_CLOSE[nextOpenDay] || null };
  if (!isTradingDay(date)) return { ...base, state: 'closed', holiday: NYSE_HOLIDAYS[date] || null, weekend: !NYSE_HOLIDAYS[date] };
  if (hm >= '09:30' && hm < close) return { ...base, state: 'open', closesAt: nyToUtc(date, close).toISOString(), earlyClose: EARLY_CLOSE[date] || null };
  if (hm >= '04:00' && hm < '09:30') return { ...base, state: 'pre' };
  if (hm >= close && hm < '20:00') return { ...base, state: 'after', earlyClose: EARLY_CLOSE[date] || null };
  return { ...base, state: 'closed' };
}

// The trading day the latest prices belong to: today once the market has opened, otherwise the last trading day.
export function sessionDate(now = new Date()) {
  const { date, hm } = nyParts(now);
  return isTradingDay(date) && hm >= '09:30' ? date : prevTradingDay(date);
}

// Previous close for each symbol: the last stored close dated before the session. last2 = [[date, close], [date, close]] (newest last).
export function prevClose(last2, session) {
  const before = (last2 || []).filter(([d, c]) => d < session && c > 0);
  return before.length ? before[before.length - 1][1] : null;
}

// {symbol: [changeFraction, price, volume?, avgVolume?]} from one price per symbol and its previous close (volume = shares
// traded today and the usual daily volume, when the price list gives them). Moves over ±90% are dropped as bad data.
export function movesFrom(rows, prevBySymbol) {
  const out = {};
  for (const r of rows) {
    const p = Number(r.price), prev = prevBySymbol[r.symbol];
    if (!(p > 0) || !(prev > 0)) continue;
    const chg = p / prev - 1;
    if (Math.abs(chg) > 0.9) continue;
    const v = Number(r.volume), av = Number(r.avgVolume);
    const row = [Math.round(chg * 1e5) / 1e5, p];
    if (v > 0) { row.push(v); if (av > 0) row.push(Math.round(av)); }
    out[r.symbol] = row;
  }
  return out;
}

// ---------- Page helpers (the stock and ETF lists come from the site's data)
export function topMovers(list, moves, n = 10) {
  const rows = list.filter((s) => moves[s.symbol]).map((s) => ({ ...s, chg: moves[s.symbol][0], now: moves[s.symbol][1] }));
  const up = rows.filter((r) => r.chg > 0).sort((a, b) => b.chg - a.chg).slice(0, n);
  const down = rows.filter((r) => r.chg < 0).sort((a, b) => a.chg - b.chg).slice(0, n);
  return { up, down };
}

export function breadth(list, moves) {
  let up = 0, down = 0, flat = 0;
  const all = [];
  for (const s of list) {
    const m = moves[s.symbol];
    if (!m) continue;
    all.push(m[0]);
    if (m[0] > 0.0005) up++; else if (m[0] < -0.0005) down++; else flat++;
  }
  all.sort((a, b) => a - b);
  return { up, down, flat, n: all.length, median: all.length ? all[Math.floor(all.length / 2)] : null };
}

// Sectors and their industries: market-value-weighted move, plus how many went up.
export function sectorMoves(stocks, moves) {
  const sec = {};
  for (const s of stocks) {
    const m = moves[s.symbol];
    if (!m || !s.sector || !(s.marketCap > 0)) continue;
    const S = (sec[s.sector] ||= { name: s.sector, w: 0, sum: 0, up: 0, n: 0, ind: {} });
    S.w += s.marketCap; S.sum += s.marketCap * m[0]; S.n++; if (m[0] > 0) S.up++;
    const I = (S.ind[s.industry || 'Other'] ||= { name: s.industry || 'Other', w: 0, sum: 0, up: 0, n: 0, best: null, worst: null });
    I.w += s.marketCap; I.sum += s.marketCap * m[0]; I.n++; if (m[0] > 0) I.up++;
    if (!I.best || m[0] > I.best.chg) I.best = { symbol: s.symbol, chg: m[0] };
    if (!I.worst || m[0] < I.worst.chg) I.worst = { symbol: s.symbol, chg: m[0] };
  }
  return Object.values(sec).map((S) => ({
    name: S.name, chg: S.sum / S.w, up: S.up, n: S.n, value: S.w,
    industries: Object.values(S.ind).map((I) => ({ name: I.name, chg: I.sum / I.w, up: I.up, n: I.n, best: I.best, worst: I.worst })).sort((a, b) => b.chg - a.chg),
  })).sort((a, b) => b.chg - a.chg);
}

// ---------- This week: earnings, the economic calendar, analyst rating changes, insider trades (refreshed hourly).
// Raw FMP rows in, trimmed rows out; only symbols the site covers (stocks and ETFs over $500M) are kept.
const num = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

// prev = the last stored calendar: the data plan only returns the latest 100 rating changes (about a day), so rating changes
// and insider trades are added to what was kept before, and anything older than 8 days is dropped.
export function calendarFrom({ earnings = [], economy = [], grades = [], insiders = [] }, covered, prev = null, now = new Date()) {
  const cutoff = new Date(now.getTime() - 8 * 864e5).toISOString().slice(0, 10);
  const has = (s) => covered.has(s);
  const er = earnings.filter((e) => has(e.symbol)).map((e) => ({
    symbol: e.symbol, date: e.date, epsEst: num(e.epsEstimated), eps: num(e.epsActual), revEst: num(e.revenueEstimated), rev: num(e.revenueActual),
  })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const ec = economy.filter((e) => e.country === 'US' && (e.impact === 'High' || e.impact === 'Medium')).map((e) => ({
    at: e.date ? `${e.date.replace(' ', 'T')}Z` : null, event: e.event, impact: e.impact, unit: e.unit || '',
    previous: num(e.previous), estimate: num(e.estimate), actual: num(e.actual),
  })).sort((a, b) => (a.at < b.at ? -1 : 1));
  const gr = grades.filter((g) => has(g.symbol) && /upgrade|downgrade/i.test(g.action || '')).map((g) => ({
    symbol: g.symbol, at: g.publishedDate, firm: g.gradingCompany, from: g.previousGrade, to: g.newGrade, action: /upgrade/i.test(g.action) ? 'up' : 'down',
    title: g.newsTitle, url: g.newsURL, price: num(g.priceWhenPosted),
  }));
  const seen = new Set();
  const grUnique = [...gr, ...(prev?.ratings || [])].filter((g) => (g.at || '').slice(0, 10) >= cutoff).filter((g) => { const k = `${g.symbol}|${g.firm}|${g.action}|${(g.at || '').slice(0, 10)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const ins = insiders.filter((x) => has(x.symbol) && /^(P-Purchase|S-Sale)/.test(x.transactionType || '')).map((x) => {
    const shares = num(x.securitiesTransacted), price = num(x.price);
    return { symbol: x.symbol, date: x.transactionDate || x.filingDate, filed: x.filingDate, who: x.reportingName, role: x.typeOfOwner,
      kind: /^P-/.test(x.transactionType) ? 'buy' : 'sell', shares, price, value: shares != null && price != null ? shares * price : null };
  }).filter((x) => x.value == null || x.value >= 50_000);
  const seenIns = new Set();
  const insAll = [...ins, ...(prev?.insiders || [])].filter((x) => (x.filed || '') >= cutoff).filter((x) => {
    const k = `${x.symbol}|${x.who}|${x.filed}|${x.date}|${x.kind}|${x.shares}`;
    if (seenIns.has(k)) return false; seenIns.add(k); return true;
  }).sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : (b.value || 0) - (a.value || 0)));
  return { earnings: er, economy: ec, ratings: grUnique.slice(0, 400), insiders: insAll.slice(0, 400) };
}
