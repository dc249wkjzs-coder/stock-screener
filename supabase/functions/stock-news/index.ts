// stock-news: today's move and the latest headlines for one stock, fetched live from FMP when a
// signed-in user opens a stock page. Requires a valid user session (verify_jwt = true), so the
// FMP key in Vault is never exposed to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Only signed-in Life Ledger users: the public site key alone is not enough.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const { data: who } = await db.auth.getUser(token);
    if (!who?.user) return json({ error: 'sign in required' }, 401);
    const { symbol } = await req.json();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol || '')) return json({ error: 'bad symbol' }, 400);
    const key = (await db.rpc('scr_secret', { secret_name: 'fmp_api_key' })).data as string;
    const get = (path: string, params: Record<string, string>) =>
      fetch(`https://financialmodelingprep.com/stable/${path}?${new URLSearchParams({ ...params, apikey: key })}`).then((r) => (r.ok ? r.json() : []));
    const [quote, news] = await Promise.all([
      get('quote', { symbol }),
      get('news/stock', { symbols: symbol, limit: '15' }),
    ]);
    const q = quote?.[0] || null;
    return json({
      quote: q && {
        price: q.price, change: q.change, changePct: q.changePercentage, previousClose: q.previousClose,
        dayLow: q.dayLow, dayHigh: q.dayHigh, volume: q.volume, time: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : null,
      },
      news: (Array.isArray(news) ? news : []).map((n: any) => ({
        date: n.publishedDate, title: n.title, publisher: n.publisher || n.site, url: n.url,
        summary: (n.text || '').slice(0, 320), image: n.image || null,
      })),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
