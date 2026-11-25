// market-today: every 10 minutes (pg_cron), one snapshot of the market for the "Market today" page, stored in scr_market.
// About 24 FMP calls a run: 15 quotes, 5 intraday charts, 2 price lists (stocks, ETFs), news, market hours.
// verify_jwt false; checks x-job-token against Vault screener_job_token (same as screener-sync).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { TILES, marketStatus, sessionDate, prevClose, movesFrom, nyToUtc, nyParts } from './lib/market.js';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const secret = async (name: string) => (await sb.rpc('scr_secret', { secret_name: name })).data as string;
const BASE = 'https://financialmodelingprep.com/stable';
let calls = 0;

async function fmp(path: string, params: Record<string, string>, key: string) {
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, apikey: key })}`;
  for (let i = 0; i < 3; i++) {
    calls++;
    const r = await fetch(url);
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 5000 * (i + 1))); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error(`${path} ${params.symbol || ''} ${r.status}: ${t.slice(0, 80)}`);
    return JSON.parse(t);
  }
  throw new Error(`${path}: rate limited`);
}
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : x != null && Number.isFinite(Number(x)) ? Number(x) : null);

async function run() {
  const key = await secret('fmp_api_key');
  const now = new Date();
  const status = marketStatus(now);
  const session = sessionDate(now);
  const errors: string[] = [];
  const safe = async <T>(label: string, f: () => Promise<T>, dflt: T): Promise<T> => {
    try { return await f(); } catch (e) { errors.push(`${label}: ${String((e as Error).message || e).slice(0, 120)}`); return dflt; }
  };

  // 1. Tiles: one quote each (no batch quotes on Starter), plus small intraday charts for the indexes and futures.
  const quotes = [];
  for (const t of TILES) {
    const q = await safe(t.sym, async () => (await fmp('quote', { symbol: t.sym }, key))[0], null);
    let spark: number[] | null = null;
    if (q && t.spark) {
      spark = await safe(`${t.sym} chart`, async () => {
        const bars = (await fmp(`historical-chart/${t.spark}`, { symbol: t.sym }, key)) as { date: string; close: number }[];
        bars.sort((a, b) => (a.date < b.date ? -1 : 1));
        if (t.spark === '1hour') return bars.slice(-24).map((b) => b.close);
        const last = bars.length ? bars[bars.length - 1].date.slice(0, 10) : null;   // the latest day with bars
        return bars.filter((b) => b.date.startsWith(last!)).map((b) => b.close);
      }, null);
    }
    quotes.push({
      ...t, ok: !!q, price: n(q?.price), change: n(q?.change), chg: q?.changePercentage == null ? null : n(q.changePercentage)! / 100,
      prevClose: n(q?.previousClose), dayLow: n(q?.dayLow), dayHigh: n(q?.dayHigh), yearLow: n(q?.yearLow), yearHigh: n(q?.yearHigh),
      at: q?.timestamp ? new Date(q.timestamp * 1000).toISOString() : null, spark,
    });
  }

  // 2. Every stock and ETF over $500M: one price list each, compared with the last stored close before this session.
  const last2: Record<string, [string, number][]> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.rpc('scr_last_closes').range(from, from + 999);
    if (error) throw error;
    for (const r of data) last2[r.symbol] = r.dates.map((d: string, i: number) => [d, Number(r.closes[i])]);
    if (data.length < 1000) break;
  }
  const prev: Record<string, number> = {};
  for (const [s, l] of Object.entries(last2)) { const p = prevClose(l, session); if (p) prev[s] = p; }
  const listed = (rows: { symbol: string; price: number }[]) => rows.filter((r) => last2[r.symbol]);
  const stockRows = await safe('stock prices', () => fmp('company-screener', { marketCapMoreThan: '500000000', isEtf: 'false', isFund: 'false', isActivelyTrading: 'true', limit: '10000' }, key), []);
  const etfRows = await safe('etf prices', () => fmp('company-screener', { marketCapMoreThan: '500000000', isEtf: 'true', isActivelyTrading: 'true', limit: '10000' }, key), []);
  const moves = { stocks: movesFrom(listed(stockRows), prev), etfs: movesFrom(listed(etfRows), prev) };

  // 3. Headlines and the exchange's own open/closed flag.
  const news = await safe('news', async () => (await fmp('news/general-latest', { limit: '24' }, key)).map((x: Record<string, string>) => ({
    title: x.title, publisher: x.publisher, site: x.site, url: x.url, image: x.image, text: (x.text || '').slice(0, 280),
    at: x.publishedDate ? nyToUtc(x.publishedDate.slice(0, 10), x.publishedDate.slice(11, 16)).toISOString() : null,
  })), []);
  const hours = await safe('market hours', async () => (await fmp('exchange-market-hours', { exchange: 'NYSE' }, key))[0], null);

  const data = { updatedAt: now.toISOString(), nyNow: nyParts(now), status: { ...status, exchangeSaysOpen: hours?.isMarketOpen ?? null }, session,
    quotes, moves, counts: { stocks: Object.keys(moves.stocks).length, etfs: Object.keys(moves.etfs).length }, news, errors };
  const { error } = await sb.from('scr_market').upsert({ id: 'today', data, updated_at: now.toISOString() });
  if (error) throw error;
  return { session, state: status.state, stocks: data.counts.stocks, etfs: data.counts.etfs, news: news.length, errors };
}

Deno.serve(async (req) => {
  const token = req.headers.get('x-job-token');
  if (!token || token !== (await secret('screener_job_token'))) return new Response('forbidden', { status: 403 });
  const task = async () => {
    calls = 0;
    const { data: row } = await sb.from('scr_runs').insert({ task: 'market' }).select('id').single();
    let ok = true, detail;
    try { detail = await run(); } catch (e) { ok = false; detail = { error: String((e as Error)?.message || e).slice(0, 500) }; }
    await sb.from('scr_runs').update({ finished_at: new Date().toISOString(), ok, calls, detail }).eq('id', row?.id);
  };
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(task());
  return new Response(JSON.stringify({ started: 'market' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
});
