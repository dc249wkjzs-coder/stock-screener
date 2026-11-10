// screener-sync: the screener's data jobs, run by pg_cron in the Life Ledger Supabase project.
//   ?task=universe      daily after the US close: list of US stocks > $500M + today's close for each (1 FMP call)
//   ?task=backfill      every 5 min until done: 2 years of daily closes for stocks that have none yet
//   ?task=fundamentals  every 5 min: refresh the 20 stocks with the oldest fundamentals (weekly cycle)
//   ?task=score         daily: technicals, moat score, Magic Formula rank, scorecard rows
// Auth: header x-job-token must equal the screener_job_token secret in Vault.
// lib/ is a copy of the repo's shared/ folder (scripts/sync-function-lib.sh).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fmpGet, fetchUniverse, fetchFundamentals, fetchPriceHistory, classifyFiling, callCount } from './lib/fmp.js';
import { buildMetrics } from './lib/metrics.js';
import { buildContext, moatScore, magicFormulaRanks } from './lib/crossSection.js';
import { priceStats, fibonacci } from './lib/indicators.js';
import { makeCard } from './lib/card.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
// SEC requires automated readers to identify themselves with a name and a real contact email.
// Stored in Vault as sec_user_agent (e.g. "LifeLedgerScreener you@example.com"); without it, filings aren't read.
const secret = async (name: string) => (await db.rpc('scr_secret', { secret_name: name })).data as string;
const nyDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function selectAll(table: string, cols: string, filter?: (q: any) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).order('symbol').range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function taskUniverse(key: string) {
  const uni = await fetchUniverse(key);
  const now = new Date().toISOString();
  const rows = uni.map((u: any) => ({
    symbol: u.symbol, name: u.companyName, sector: u.sector, industry: u.industry, exchange: u.exchangeShortName,
    market_cap: u.marketCap, price: u.price, beta: u.beta, active: true, price_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('scr_stocks').upsert(rows.slice(i, i + 500), { onConflict: 'symbol' });
    if (error) throw error;
  }
  const live = new Set(rows.map((r: any) => r.symbol));
  const known = await selectAll('scr_stocks', 'symbol,active');
  const gone = known.filter((k) => k.active && !live.has(k.symbol)).map((k) => k.symbol);
  if (gone.length) await db.from('scr_stocks').update({ active: false }).in('symbol', gone);
  const priced = new Set((await selectAll('scr_prices', 'symbol')).map((p) => p.symbol));
  const fresh = rows.filter((r: any) => !priced.has(r.symbol)).map((r: any) => ({ symbol: r.symbol }));
  for (let i = 0; i < fresh.length; i += 500) await db.from('scr_prices').insert(fresh.slice(i, i + 500));
  // The latest close for every stock that already has history. The date comes from the last trade
  // time of a large stock, so a run before the open or on a holiday doesn't invent a new day.
  const q = await fmpGet('quote', { symbol: 'AAPL' }, key);
  const date = q?.[0]?.timestamp ? nyDate(new Date(q[0].timestamp * 1000)) : nyDate();
  const closes = uni.map((u: any) => ({ symbol: u.symbol, date, close: u.price }));
  let appended = 0;
  for (let i = 0; i < closes.length; i += 400) {
    const { data, error } = await db.rpc('scr_append_closes', { rows: closes.slice(i, i + 400) });
    if (error) throw error;
    appended += data as number;
  }
  return { stocks: rows.length, inactive: gone.length, newStocks: fresh.length, appended, date };
}

async function taskBackfill(key: string, limit = 150) {
  const { data: todo } = await db.from('scr_prices').select('symbol').is('backfilled_at', null).limit(limit);
  let done = 0; const failed: string[] = [];
  const from = isoDaysAgo(760);
  for (const { symbol } of todo || []) {
    try {
      const hist = await fetchPriceHistory(symbol, key, from);
      const recent = hist.slice(-520);
      await db.from('scr_prices').update({ dates: recent.map((h: any) => h[0]), closes: recent.map((h: any) => h[1]), backfilled_at: new Date().toISOString() }).eq('symbol', symbol);
      done++;
    } catch (e) { failed.push(`${symbol}: ${String(e).slice(0, 80)}`); }
  }
  const { count } = await db.from('scr_prices').select('symbol', { count: 'exact', head: true }).is('backfilled_at', null);
  return { done, failed, remaining: count };
}

async function taskFundamentals(key: string, limit = 20) {
  const SEC_UA = await secret('sec_user_agent');
  const stale = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: todo, error } = await db.from('scr_stocks')
    .select('symbol,name,sector,industry,market_cap,price,beta').eq('active', true)
    .or(`fundamentals_at.is.null,fundamentals_at.lt.${stale}`)
    .order('fundamentals_at', { ascending: true, nullsFirst: true }).limit(limit);
  if (error) throw error;
  let done = 0; const failed: string[] = []; let secReads = 0;
  for (const s of todo || []) {
    try {
      const raw: any = await fetchFundamentals(s.symbol, key);
      // Read the cover of any new prospectus so bond issues aren't counted as stock sales.
      const links = (Array.isArray(raw.filings) ? raw.filings : [])
        .filter((f: any) => /^(424B[1-8]|S-1|S-1\/A|F-1|F-1\/A)$/.test(f.formType) && f.filingDate >= isoDaysAgo(95))
        .map((f: any) => ({ link: f.finalLink || f.link, form: f.formType, filed: f.filingDate.slice(0, 10) }));
      raw.filingKinds = {};
      if (links.length && SEC_UA) {
        const { data: known } = await db.from('scr_filings').select('link,kind,note').in('link', links.map((l: any) => l.link));
        for (const k of known || []) raw.filingKinds[k.link] = k;
        for (const l of links.filter((l: any) => !raw.filingKinds[l.link]).slice(0, 6)) {
          const c = await classifyFiling(l.link, SEC_UA).catch((e: any) => ({ kind: 'unknown', note: String(e).slice(0, 80) }));
          secReads++;
          raw.filingKinds[l.link] = c;
          if (c.kind !== 'unknown') await db.from('scr_filings').upsert({ link: l.link, symbol: s.symbol, form: l.form, filed: l.filed, kind: c.kind, note: c.note });
          await new Promise((r) => setTimeout(r, 150)); // SEC asks for <10 requests/second
        }
      }
      const uni = { companyName: s.name, sector: s.sector, industry: s.industry, marketCap: Number(s.market_cap), price: Number(s.price), beta: Number(s.beta) };
      const metrics = buildMetrics(raw, uni);
      const gaps = metrics.dataGaps.length;
      await db.from('scr_stocks').update({ metrics, fundamentals_at: new Date().toISOString(), error: gaps ? `missing: ${metrics.dataGaps.join(',')}` : null }).eq('symbol', s.symbol);
      done++;
    } catch (e) {
      failed.push(`${s.symbol}: ${String(e).slice(0, 80)}`);
      // Push it to the back of the queue so one bad stock can't block the rest.
      await db.from('scr_stocks').update({ fundamentals_at: new Date().toISOString(), error: String(e).slice(0, 200) }).eq('symbol', s.symbol);
    }
  }
  return { done, failed, secReads };
}

async function taskScore() {
  // 1) Technicals, page by page so memory stays small.
  const tech: Record<string, any> = {};
  for (let from = 0; ; from += 400) {
    const { data, error } = await db.from('scr_prices').select('symbol,dates,closes').not('backfilled_at', 'is', null).order('symbol').range(from, from + 399);
    if (error) throw error;
    for (const p of data) {
      const prices = p.dates.map((d: string, i: number) => [d, p.closes[i]]);
      if (prices.length < 20) continue;
      tech[p.symbol] = { ...priceStats(prices), fib: fibonacci(prices) };
    }
    if (data.length < 400) break;
  }
  // 2) Cross-sectional scores over every stock with fundamentals.
  const rows = await selectAll('scr_stocks', 'symbol,metrics', (q) => q.eq('active', true).not('metrics', 'is', null));
  const all = rows.map((r) => r.metrics);
  const ctx = buildContext(all);
  const magic = magicFormulaRanks(all);
  const now = new Date().toISOString();
  const out = all.map((m: any) => {
    const moat = moatScore(m, ctx);
    const t = tech[m.symbol] || null;
    return { symbol: m.symbol, card: { ...makeCard(m, t, moat, magic[m.symbol]), moatParts: moat.parts, fib: t?.fib ?? null }, scored_at: now };
  });
  for (let i = 0; i < out.length; i += 300) {
    const { error } = await db.from('scr_stocks').upsert(out.slice(i, i + 300), { onConflict: 'symbol' });
    if (error) throw error;
  }
  return { scored: out.length, withPrices: Object.keys(tech).length };
}

async function run(task: string, params: URLSearchParams) {
  const { data: runRow } = await db.from('scr_runs').insert({ task }).select('id').single();
  const callsBefore = callCount;
  let ok = true, detail: any;
  try {
    const key = await secret('fmp_api_key');
    if (task === 'universe') detail = await taskUniverse(key);
    else if (task === 'backfill') detail = await taskBackfill(key, Number(params.get('limit') || 150));
    else if (task === 'fundamentals') detail = await taskFundamentals(key, Number(params.get('limit') || 20));
    else if (task === 'score') detail = await taskScore();
    else throw new Error(`unknown task ${task}`);
  } catch (e) { ok = false; detail = { error: String((e as any)?.message || e).slice(0, 500) }; }
  await db.from('scr_runs').update({ finished_at: new Date().toISOString(), ok, calls: callCount - callsBefore, detail }).eq('id', runRow?.id);
}

Deno.serve(async (req) => {
  const token = req.headers.get('x-job-token');
  if (!token || token !== (await secret('screener_job_token'))) return new Response('forbidden', { status: 403 });
  const params = new URL(req.url).searchParams;
  const task = params.get('task') || '';
  // Run in the background so pg_cron's short HTTP timeout doesn't cut the job off.
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(run(task, params));
  return new Response(JSON.stringify({ started: task }), { status: 202, headers: { 'Content-Type': 'application/json' } });
});
