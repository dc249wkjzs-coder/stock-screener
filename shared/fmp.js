// FMP (Financial Modeling Prep) fetch helpers. Works in Node 18+, Deno and browsers (global fetch).
// Starter plan: 300 calls/minute, US only, annual + TTM fundamentals, 5 years of history.

const BASE = 'https://financialmodelingprep.com/stable';

// Spaces calls out so a burst never goes over the plan's per-minute limit (Starter: 300/min).
let callsPerMinute = 200;
let nextSlot = 0;
export function setRateLimit(perMinute) { callsPerMinute = perMinute; }
async function slot() {
  const gap = 60000 / callsPerMinute;
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}
export let callCount = 0;

export async function fmpGet(path, params, apiKey) {
  const qs = new URLSearchParams({ ...params, apikey: apiKey });
  const url = `${BASE}/${path}?${qs}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    await slot();
    callCount++;
    const res = await fetch(url);
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 15000 * (attempt + 1))); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`FMP ${path} ${res.status}: ${text.slice(0, 120)}`);
    try { return JSON.parse(text); } catch { throw new Error(`FMP ${path}: bad JSON`); }
  }
  throw new Error(`FMP ${path}: rate limited`);
}

// The whole universe in one call: stocks above a market cap floor, with today's price.
// US companies on any exchange except OTC, plus foreign companies listed on NYSE/Nasdaq (ASML, TSM, ...).
export async function fetchUniverse(apiKey, minCap = 500_000_000) {
  const rows = await fmpGet('company-screener', {
    marketCapMoreThan: String(minCap), isEtf: 'false', isFund: 'false',
    isActivelyTrading: 'true', limit: '10000',
  }, apiKey);
  const usListed = /^(NYSE|NASDAQ|AMEX)$/;
  return rows.filter((r) => r.price > 0 && (r.country === 'US' ? r.exchangeShortName !== 'OTC' : usListed.test(r.exchangeShortName || '')));
}

const isoDaysAgo = (d, today = new Date()) => new Date(today.getTime() - d * 864e5).toISOString().slice(0, 10);

// Twelve calls per stock. Each piece is optional: a failure leaves that piece as { __error }.
export async function fetchFundamentals(symbol, apiKey, today = new Date()) {
  const get = (path, params) => fmpGet(path, { symbol, ...params }, apiKey).catch((e) => ({ __error: String(e.message || e) }));
  const [profile, income, balance, keyMetrics, ratios, kmTtm, ratiosTtm, estimates, scores, dcf, filings, priceTarget] = await Promise.all([
    get('profile', {}),
    get('income-statement', { period: 'annual', limit: '6' }),
    get('balance-sheet-statement', { period: 'annual', limit: '5' }),
    get('key-metrics', { period: 'annual', limit: '5' }),
    get('ratios', { period: 'annual', limit: '5' }),
    get('key-metrics-ttm', {}),
    get('ratios-ttm', {}),
    get('analyst-estimates', { period: 'annual', limit: '10' }),
    get('financial-scores', {}),
    get('discounted-cash-flow', {}),
    get('sec-filings-search/symbol', { from: isoDaysAgo(120, today), to: today.toISOString().slice(0, 10), limit: '200' }),
    get('price-target-consensus', {}),
  ]);
  return { symbol, fetchedAt: today.toISOString(), profile, income, balance, keyMetrics, ratios, kmTtm, ratiosTtm, estimates, scores, dcf, filings, priceTarget };
}

// Reads the cover of an SEC prospectus (424B / S-1) and says what is being sold.
// SEC asks automated readers to send a User-Agent with a contact address.
export async function classifyFiling(url, userAgent) {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'text/html' } });
  if (!res.ok) return { kind: 'unknown', note: `SEC ${res.status}` };
  const html = (await res.text()).slice(0, 400_000);
  return { ...classifyProspectusText(htmlToText(html)) };
}

export function htmlToText(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#8217;|&rsquo;/gi, "'").replace(/\s+/g, ' ');
}

// Only the cover matters: base prospectuses list every security a company *could* sell.
export function classifyProspectusText(text) {
  const cover = text.slice(0, 8000);
  if (/convertible (senior )?(notes|debentures|preferred)|exchangeable (senior )?notes/i.test(cover)) return { kind: 'convert', note: 'Convertible offering' };
  if (/at[- ]the[- ]market|equity distribution agreement|sales agreement|sales agents?\b/i.test(cover)) return { kind: 'atm', note: 'At-the-market program' };
  if (/\d+(\.\d+)?\s?%\s*(senior |subordinated |fixed[- ]rate |floating[- ]rate )*(notes|debentures|bonds)|notes due \d{4}|market[- ]linked|structured (notes|investments)|medium[- ]term notes/i.test(cover)) return { kind: 'debt', note: 'Debt (notes/bonds)' };
  if (/shares of (our |its )?(class [a-c] )?common stock|ordinary shares|american depositary (shares|receipts)|common units|warrants to purchase/i.test(cover)) return { kind: 'equity', note: 'Stock offering' };
  return { kind: 'unknown', note: 'Could not tell from the cover' };
}

// Long history for the backtest: 12 annual reports and weekly closes since 2016 (split-adjusted for
// valuation, dividend-adjusted for returns). Five calls; statements are skipped for funds (benchmark).
export async function fetchHistory(symbol, apiKey, { statements = true, from = '2016-01-01' } = {}) {
  const get = (path, params) => fmpGet(path, { symbol, ...params }, apiKey).catch((e) => ({ __error: String(e.message || e) }));
  const [income, balance, cash, light, adj] = await Promise.all([
    statements ? get('income-statement', { period: 'annual', limit: '12' }) : [],
    statements ? get('balance-sheet-statement', { period: 'annual', limit: '12' }) : [],
    statements ? get('cash-flow-statement', { period: 'annual', limit: '12' }) : [],
    get('historical-price-eod/light', { from }),
    get('historical-price-eod/dividend-adjusted', { from }),
  ]);
  if (!Array.isArray(light)) throw new Error(`prices: ${light?.__error || 'none'}`);
  return { income, balance, cash, light: light.map((r) => [r.date, r.price]), adj: Array.isArray(adj) ? adj.map((r) => [r.date, r.adjClose]) : [] };
}

// Up to ~5 years of daily closes (light endpoint: date + close + volume).
export async function fetchPriceHistory(symbol, apiKey, from) {
  const rows = await fmpGet('historical-price-eod/light', { symbol, from }, apiKey);
  return rows.map((r) => [r.date, r.price]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
