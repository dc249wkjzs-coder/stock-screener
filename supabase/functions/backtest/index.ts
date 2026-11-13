// backtest: replays a screen over the stored quarterly snapshots (scr_replay) and returns the growth of
// $10,000 against the S&P 500 (SPY) and all screener stocks. Signed-in users only (verify_jwt = true plus a
// user check). lib/ is a copy of shared/ (scripts/sync-function-lib.sh).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBacktest } from './lib/backtest.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The snapshots change at most once a day, so keep them in memory between requests on a warm instance.
let cache: { at: number; snaps: any[] } | null = null;
async function snapshots() {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.snaps;
  const { data, error } = await db.from('scr_replay').select('asof,col,bench_tr').order('asof');
  if (error) throw error;
  cache = { at: Date.now(), snaps: (data || []).map((r: any) => ({ asof: r.asof, col: r.col, benchTr: r.bench_tr })) };
  return cache.snaps;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const { data: who } = await db.auth.getUser(token);
    if (!who?.user) return json({ error: 'sign in required' }, 401);
    const { criteria } = await req.json();
    if (!criteria || typeof criteria !== 'object') return json({ error: 'criteria required' }, 400);
    const snaps = await snapshots();
    if (snaps.length < 2) return json({ error: 'The past data is still being prepared. Try again later.' }, 503);
    return json(runBacktest(snaps, criteria));
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
